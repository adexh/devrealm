import { execFile } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import * as store from '../store'

export const VSCODE_BUNDLE_ID = 'com.microsoft.VSCode'
export const VSCODE_APP_NAMES = ['Code', 'Visual Studio Code']
const MAC_BUNDLE_NAME = 'Visual Studio Code.app'
const MAC_CLI_IN_BUNDLE = 'Contents/Resources/app/bin/code'
const STATUS_TIMEOUT_MS = 30_000

/**
 * How to run the CLI without a shell. On macOS and Linux `bin/code` is a plain
 * script that execFile can run directly. On Windows it is a `.cmd`, which Node
 * refuses to spawn without a shell, and a shell would parse metacharacters in
 * the folder path. The `.cmd` only sets ELECTRON_RUN_AS_NODE and runs
 * `Code.exe resources\app\out\cli.js`, so that is done here instead.
 */
export type CliInvocation = {
  command: string
  prefixArgs: string[]
  env: NodeJS.ProcessEnv
}

/** The `.app` path out of a running executable's command line, translocated or not. */
export function bundleFromExecutable(command: string): string | null {
  const marker = `${MAC_BUNDLE_NAME}/Contents/MacOS/`
  const index = command.indexOf(marker)
  return index === -1 ? null : command.slice(0, index + MAC_BUNDLE_NAME.length)
}

/**
 * The CLI is a script that forwards to a remote CLI whenever VSCODE_IPC_HOOK_CLI
 * is set, which it is inside a VS Code terminal. Strip the whole family so
 * `npm run dev` from such a terminal still talks to the desktop instance and
 * not to one window's extension host.
 */
function cliEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('VSCODE_') || key.startsWith('ELECTRON_')) continue
    env[key] = value
  }
  return { ...env, ...extra }
}

function unixCandidates(mainCommand: string | null): string[] {
  if (process.platform === 'darwin') {
    const bundle = mainCommand ? bundleFromExecutable(mainCommand) : null
    return [
      ...(bundle ? [path.join(bundle, MAC_CLI_IN_BUNDLE)] : []),
      path.join('/Applications', MAC_BUNDLE_NAME, MAC_CLI_IN_BUNDLE),
      path.join(os.homedir(), 'Applications', MAC_BUNDLE_NAME, MAC_CLI_IN_BUNDLE),
      '/usr/local/bin/code',
      '/opt/homebrew/bin/code',
    ]
  }
  return [
    '/usr/share/code/bin/code',
    '/usr/bin/code',
    '/snap/bin/code',
    '/var/lib/flatpak/exports/bin/com.visualstudio.code',
    path.join(os.homedir(), '.local/bin/code'),
  ]
}

function onPath(name: string): string | null {
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue
    const candidate = path.join(dir, name)
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

/** Win32_Process quotes the executable; the command may also be `Code.exe` with no directory. */
function windowsExeFromCommand(command: string): string | null {
  const match = command.match(/^"?([^"]*\\Code\.exe)"?/i)
  return match ? match[1] : null
}

function windowsInvocation(mainCommand: string | null): CliInvocation | null {
  const editor = store.getEditorSettings().editors.find(item => item.id === 'vscode')
  const configured = (editor?.windowsExecutablePaths ?? []).flatMap(candidate => {
    if ('absolutePath' in candidate) return candidate.absolutePath ? [candidate.absolutePath] : []
    return [path.join(process.env[candidate.env] ?? '', ...candidate.segments)]
  })
  const fromRunning = mainCommand ? windowsExeFromCommand(mainCommand) : null
  const exe = [...(fromRunning ? [fromRunning] : []), ...configured].find(candidate => fs.existsSync(candidate))
  if (!exe) return null
  const cliScript = path.join(path.dirname(exe), 'resources', 'app', 'out', 'cli.js')
  if (!fs.existsSync(cliScript)) return null
  return { command: exe, prefixArgs: [cliScript], env: cliEnv({ ELECTRON_RUN_AS_NODE: '1' }) }
}

/**
 * The bundle of the running process is tried first so a VS Code launched from
 * a Downloads folder, or through App Translocation, is found where it runs.
 * PATH comes last: a GUI-launched app rarely has a useful one.
 */
export function resolveVsCodeCli(mainCommand: string | null): CliInvocation | null {
  if (process.platform === 'win32') return windowsInvocation(mainCommand)
  const command = unixCandidates(mainCommand).find(candidate => fs.existsSync(candidate)) ?? onPath('code')
  return command ? { command, prefixArgs: [], env: cliEnv() } : null
}

function runCli(cli: CliInvocation, args: string[], timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cli.command, [...cli.prefixArgs, ...args], { env: cli.env, timeout, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        const detail = (stderr || error.message).trim().split('\n')[0]
        reject(new Error(`VS Code CLI failed: ${detail}`))
        return
      }
      resolve(stdout)
    })
  })
}

/** Only the `Workspace Stats` block is trusted; see docs/ides-implementation.md. */
export function parseStatusWindowTitles(output: string): string[] {
  const titles: string[] = []
  for (const line of output.split('\n')) {
    const match = line.match(/^\|\s{2}Window \((.*)\)\s*$/)
    if (match) titles.push(match[1])
  }
  return titles
}

/** Never call this without a running instance: `--status` starts one. */
export async function readStatusWindowTitles(cli: CliInvocation): Promise<string[]> {
  return parseStatusWindowTitles(await runCli(cli, ['--status'], STATUS_TIMEOUT_MS))
}

/**
 * The target must be an existing absolute folder or `.code-workspace` file.
 * The renderer chose it from a snapshot, but the IPC surface is reachable by
 * any renderer code, so what reaches the CLI is checked here, not trusted.
 */
export function assertOpenablePath(target: string): void {
  if (typeof target !== 'string' || !path.isAbsolute(target) || target.includes('\0')) {
    throw new Error('Not an absolute path.')
  }
  if (target.startsWith('-')) throw new Error('Not a path VS Code can open.')
  let stat: fs.Stats
  try {
    stat = fs.statSync(target)
  } catch {
    throw new Error(`"${target}" no longer exists.`)
  }
  if (!stat.isDirectory() && !(stat.isFile() && target.endsWith('.code-workspace'))) {
    throw new Error('Only folders and .code-workspace files can be opened.')
  }
}

/** VS Code reuses the window that already has the folder open, which is how focus works without Accessibility. */
export async function openWithCli(cli: CliInvocation, target: string): Promise<void> {
  assertOpenablePath(target)
  await runCli(cli, [target], 15_000)
}
