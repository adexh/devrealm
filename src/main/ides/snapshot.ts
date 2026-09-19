import type { IdeSnapshot, IdeWindow, IdeWindowSource } from '../../shared/ide'
import { buildKnownFolderIndex, lookupFolder, type KnownFolderIndex } from './knownFolders'
import { isAccessibilityGranted, listWindowTitles } from './macWindows'
import { findIdeProcessTree, listProcesses, VSCODE_PROCESS_MATCHER, type ProcessRow } from './processes'
import { folderCandidates, parseWindowTitle } from './titles'
import { readStatusWindowTitles, resolveVsCodeCli, VSCODE_APP_NAMES, VSCODE_BUNDLE_ID } from './vscodeCli'

/** `--status` walks every open folder to count files, so it is never run more often than this. */
const STATUS_CACHE_MS = 10_000
const VSCODE_LABEL = 'VS Code'

let inFlight: Promise<IdeSnapshot> | null = null
let statusCache: { at: number; titles: string[] } | null = null
let statusInFlight: Promise<string[]> | null = null

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Concurrent callers share one capture, so a manual refresh during a poll does not spawn a second `ps`. */
export function captureIdeSnapshot(): Promise<IdeSnapshot> {
  if (!inFlight) {
    inFlight = capture().finally(() => { inFlight = null })
  }
  return inFlight
}

/** Called after an action that changes the window set, so the next poll does not show a closed window for ten seconds. */
export function invalidateWindowCache(): void {
  statusCache = null
}

async function cachedStatusTitles(cli: string): Promise<string[]> {
  if (statusCache && Date.now() - statusCache.at < STATUS_CACHE_MS) return statusCache.titles
  if (!statusInFlight) {
    statusInFlight = readStatusWindowTitles(cli)
      .then(titles => {
        statusCache = { at: Date.now(), titles }
        return titles
      })
      .finally(() => { statusInFlight = null })
  }
  return statusInFlight
}

function toWindow(title: string, index: KnownFolderIndex): IdeWindow {
  const parsed = parseWindowTitle(title, VSCODE_APP_NAMES)
  const match = lookupFolder(index, folderCandidates(parsed))
  const segments = parsed.segments
  // With two or more segments the right-most is the root name or a profile;
  // with one it is as likely to be a lone editor, so no guess is made.
  const rootName = match?.rootName ?? (segments.length >= 2 ? segments[segments.length - 1] : null)
  return {
    id: match ? `folder:${match.folder.path}` : `title:${title}`,
    ide: 'vscode',
    title,
    rootName,
    folderPath: match?.folder.path ?? null,
    repoId: match?.folder.repoId ?? null,
    workspaceId: match?.folder.workspaceId ?? null,
    dirty: parsed.dirty,
  }
}

/** Two folderless windows can share a title; keys must still be unique. */
function dedupeIds(windows: IdeWindow[]): IdeWindow[] {
  const counts = new Map<string, number>()
  return windows.map(window => {
    const seen = counts.get(window.id) ?? 0
    counts.set(window.id, seen + 1)
    return seen === 0 ? window : { ...window, id: `${window.id}#${seen + 1}` }
  })
}

async function capture(): Promise<IdeSnapshot> {
  const started = Date.now()
  const warnings: string[] = []

  let rows: ProcessRow[] = []
  try {
    rows = await listProcesses()
  } catch (error) {
    warnings.push(message(error))
  }
  if (process.platform === 'win32') {
    warnings.push('Resource usage is not available on Windows yet.')
  }

  const tree = findIdeProcessTree(rows, VSCODE_PROCESS_MATCHER)
  const cli = resolveVsCodeCli(tree.main?.command ?? null)
  const running = tree.main !== null
  const accessibility = {
    supported: process.platform === 'darwin',
    granted: isAccessibilityGranted(false),
  }

  let titles: string[] = []
  let source: IdeWindowSource = 'none'
  if (running) {
    if (accessibility.granted) {
      try {
        titles = await listWindowTitles(VSCODE_BUNDLE_ID)
        source = 'accessibility'
      } catch (error) {
        warnings.push(message(error))
      }
    }
    if (source === 'none' && cli) {
      try {
        titles = await cachedStatusTitles(cli)
        source = 'cli'
      } catch (error) {
        warnings.push(message(error))
      }
    }
    if (source === 'none' && !cli) {
      warnings.push('The VS Code command line tool was not found, so windows cannot be listed.')
    }
  }

  const index = buildKnownFolderIndex()
  const windows = dedupeIds(titles.map(title => toWindow(title, index)))

  return {
    ide: 'vscode',
    label: VSCODE_LABEL,
    installed: running || cli !== null,
    running,
    windows,
    usage: tree.usage,
    source,
    capabilities: {
      focusByTitle: running && accessibility.granted,
      close: running && accessibility.granted,
      quit: running,
    },
    accessibility,
    warnings,
    capturedAt: Date.now(),
    durationMs: Date.now() - started,
  }
}

/** Command line of the running main process, for actions that need the CLI after the snapshot. */
export async function findRunningMain(): Promise<ProcessRow | null> {
  try {
    return findIdeProcessTree(await listProcesses(), VSCODE_PROCESS_MATCHER).main
  } catch {
    return null
  }
}
