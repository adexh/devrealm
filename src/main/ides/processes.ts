import { execFile } from 'child_process'
import type { IdeProcessGroup, IdeProcessKind, IdeUsage } from '../../shared/ide'

export type ProcessRow = {
  pid: number
  ppid: number
  /** Percent of one core, as `ps` reports it: a recent average, not an instant. */
  cpu: number
  rssKb: number
  command: string
}

export type IdeProcessMatcher = {
  /** The one process that owns the windows. Must reject the CLI, which runs the same binary. */
  isMain: (command: string) => boolean
  classify: (command: string) => IdeProcessKind
}

export type IdeProcessTree = {
  main: ProcessRow | null
  usage: IdeUsage | null
}

export function parsePsOutput(text: string): ProcessRow[] {
  const rows: ProcessRow[] = []
  for (const line of text.split('\n')) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+([\d.]+)\s+(\d+)\s+(.*)$/)
    if (!match) continue
    rows.push({
      pid: Number(match[1]),
      ppid: Number(match[2]),
      cpu: Number.parseFloat(match[3]),
      rssKb: Number(match[4]),
      command: match[5],
    })
  }
  return rows
}

/**
 * `-ww` matters: without it macOS truncates the command to the terminal width,
 * the `--type=` flag falls off and every helper looks like a main process.
 */
export function listProcesses(): Promise<ProcessRow[]> {
  if (process.platform === 'win32') return Promise.resolve([])
  return new Promise((resolve, reject) => {
    execFile('ps', ['axww', '-o', 'pid=,ppid=,pcpu=,rss=,command='], { maxBuffer: 32 * 1024 * 1024 }, (error, stdout) => {
      if (error) {
        reject(new Error(`Could not list processes: ${error.message}`))
        return
      }
      resolve(parsePsOutput(stdout))
    })
  })
}

/**
 * Walks down from the main process. Children are found through a parent map,
 * not by pid order, because a long-running IDE spawns children whose recycled
 * pids are lower than its own.
 */
export function findIdeProcessTree(rows: ProcessRow[], matcher: IdeProcessMatcher): IdeProcessTree {
  const mains = rows.filter(row => matcher.isMain(row.command))
  if (mains.length === 0) return { main: null, usage: null }
  const main = mains.reduce((oldest, row) => row.pid < oldest.pid ? row : oldest)

  const childrenOf = new Map<number, ProcessRow[]>()
  for (const row of rows) {
    const siblings = childrenOf.get(row.ppid)
    if (siblings) siblings.push(row)
    else childrenOf.set(row.ppid, [row])
  }

  const byKind = new Map<IdeProcessKind, IdeProcessGroup>()
  const add = (kind: IdeProcessKind, row: ProcessRow) => {
    const group = byKind.get(kind) ?? { kind, count: 0, cpuPercent: 0, memoryBytes: 0 }
    group.count += 1
    group.cpuPercent += row.cpu
    group.memoryBytes += row.rssKb * 1024
    byKind.set(kind, group)
  }

  const seen = new Set<number>()
  const queue: ProcessRow[] = [...mains]
  for (const row of mains) seen.add(row.pid)
  while (queue.length > 0) {
    const row = queue.shift() as ProcessRow
    add(matcher.isMain(row.command) ? 'main' : matcher.classify(row.command), row)
    for (const child of childrenOf.get(row.pid) ?? []) {
      if (seen.has(child.pid)) continue
      seen.add(child.pid)
      queue.push(child)
    }
  }

  const groups = [...byKind.values()]
    .map(group => ({ ...group, cpuPercent: round1(group.cpuPercent) }))
    .sort((a, b) => b.memoryBytes - a.memoryBytes)
  return {
    main,
    usage: {
      mainPid: main.pid,
      processCount: groups.reduce((total, group) => total + group.count, 0),
      cpuPercent: round1(groups.reduce((total, group) => total + group.cpuPercent, 0)),
      memoryBytes: groups.reduce((total, group) => total + group.memoryBytes, 0),
      groups,
    },
  }
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/** Extension hosts carry these Node flags on every platform; the pty host and shared process do not. */
const EXTENSION_HOST_FLAG = '--dns-result-order=ipv4first'

export const VSCODE_PROCESS_MATCHER: IdeProcessMatcher = {
  isMain: (command) => {
    if (command.includes('--type=') || command.includes('cli.js')) return false
    if (process.platform === 'darwin') {
      return /Visual Studio Code\.app\/Contents\/MacOS\/Electron(\s|$)/.test(command)
    }
    if (process.platform === 'win32') {
      return /\\Code\.exe(\s|$)/i.test(command)
    }
    return /(^|\/)code(\s|$)/.test(command) && !/code-server|\/bin\/code(\s|$)/.test(command)
  },
  classify: (command) => {
    if (command.includes('--type=renderer')) return 'renderer'
    if (command.includes('--type=gpu-process')) return 'gpu'
    if (command.includes('--type=')) {
      if (command.includes(EXTENSION_HOST_FLAG) || command.includes('Code Helper (Plugin)')) return 'extension-host'
      return 'utility'
    }
    return 'child'
  },
}
