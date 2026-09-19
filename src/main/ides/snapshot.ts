import type { IdeSnapshot, IdeSnapshotOptions, IdeWindow, IdeWindowSource } from '../../shared/ide'
import { buildKnownFolderIndex, lookupFolder, type KnownFolderIndex } from './knownFolders'
import { isAccessibilityGranted, listWindowTitles } from './macWindows'
import { findIdeProcessTree, listProcesses, VSCODE_PROCESS_MATCHER, type ProcessRow } from './processes'
import { folderCandidates, parseWindowTitle } from './titles'
import { readStatusWindowTitles, resolveVsCodeCli, VSCODE_APP_NAMES, VSCODE_BUNDLE_ID, type CliInvocation } from './vscodeCli'

/** `--status` walks every open folder to count files, so it is never run more often than this. */
const STATUS_CACHE_MS = 10_000
const VSCODE_LABEL = 'VS Code'

let inFlight: Promise<IdeSnapshot> | null = null
let statusCache: { at: number; titles: string[] } | null = null
let statusInFlight: Promise<string[]> | null = null
/** Bumped by invalidation so a `--status` that was already running cannot write a stale list back. */
let statusGeneration = 0

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Concurrent callers share one capture, so a manual refresh during a poll does
 * not spawn a second `ps`. A `fresh` request never joins one already running:
 * it follows an action, and a capture that began before the action would
 * report the window set the action just changed.
 */
export function captureIdeSnapshot(options: IdeSnapshotOptions = {}): Promise<IdeSnapshot> {
  if (options.fresh) invalidateWindowCache()
  if (!inFlight || options.fresh) {
    const run = capture(Boolean(options.fresh))
    inFlight = run
    void run.finally(() => { if (inFlight === run) inFlight = null })
  }
  return inFlight
}

/** Called after an action that changes the window set, so the next poll does not show a closed window for ten seconds. */
export function invalidateWindowCache(): void {
  statusCache = null
  statusGeneration += 1
}

async function statusTitles(cli: CliInvocation, fresh: boolean): Promise<string[]> {
  if (!fresh && statusCache && Date.now() - statusCache.at < STATUS_CACHE_MS) return statusCache.titles
  if (!statusInFlight || fresh) {
    const generation = statusGeneration
    const run = readStatusWindowTitles(cli).then(titles => {
      if (generation === statusGeneration) statusCache = { at: Date.now(), titles }
      return titles
    })
    statusInFlight = run
    void run.finally(() => { if (statusInFlight === run) statusInFlight = null })
  }
  return statusInFlight
}

function toWindow(title: string, index: KnownFolderIndex): Omit<IdeWindow, 'titleIndex'> {
  const parsed = parseWindowTitle(title, VSCODE_APP_NAMES)
  const match = lookupFolder(index, folderCandidates(parsed))
  const segments = parsed.segments
  // With two or more segments the right-most is the root name or a profile;
  // with one it is as likely to be a lone editor, so no guess is made.
  const rootName = match?.rootName ?? (segments.length >= 2 ? segments[segments.length - 1] : null)
  const folder = match?.folder ?? null
  return {
    id: folder ? `folder:${folder.openPath}` : `title:${title}`,
    ide: 'vscode',
    title,
    rootName,
    folderPath: folder?.path ?? null,
    openPath: folder?.openPath ?? null,
    repoId: folder?.repoId ?? null,
    workspaceId: folder?.workspaceId ?? null,
    dirty: parsed.dirty,
    ambiguous: match?.ambiguous ?? false,
  }
}

/**
 * Same-titled windows get a position so an action can name the right one,
 * and a suffix on the id so React keys stay unique.
 */
function numberWindows(windows: Omit<IdeWindow, 'titleIndex'>[]): IdeWindow[] {
  const titleCounts = new Map<string, number>()
  const idCounts = new Map<string, number>()
  return windows.map(win => {
    const titleIndex = (titleCounts.get(win.title) ?? 0) + 1
    titleCounts.set(win.title, titleIndex)
    const idSeen = idCounts.get(win.id) ?? 0
    idCounts.set(win.id, idSeen + 1)
    return { ...win, titleIndex, id: idSeen === 0 ? win.id : `${win.id}#${idSeen + 1}` }
  })
}

async function capture(fresh: boolean): Promise<IdeSnapshot> {
  const started = Date.now()
  const warnings: string[] = []

  // No process list means nothing here can be trusted, so the caller keeps its
  // last good snapshot and shows the error, rather than a confident "not running".
  const rows: ProcessRow[] = await listProcesses()
  const tree = findIdeProcessTree(rows, VSCODE_PROCESS_MATCHER)
  if (tree.usage && tree.usage.cpuPercent === null) {
    warnings.push('CPU usage is not available on this platform; memory and process counts are.')
  }

  const cli = resolveVsCodeCli(tree.main?.command ?? null)
  const running = tree.main !== null
  const accessibility = {
    supported: process.platform === 'darwin',
    granted: isAccessibilityGranted(false),
  }

  let titles: string[] = []
  let source: IdeWindowSource = 'none'
  // Listing through System Events is the same Automation route Close and
  // raise-by-title take, so if it fails those are offered only once it works.
  let windowControl = false
  if (running) {
    if (accessibility.granted) {
      try {
        titles = await listWindowTitles(VSCODE_BUNDLE_ID)
        source = 'accessibility'
        windowControl = true
      } catch (error) {
        warnings.push(message(error))
      }
    }
    if (source === 'none' && cli) {
      try {
        titles = await statusTitles(cli, fresh)
        source = 'cli'
        warnings.push('Listed through the VS Code command line, which leaves out windows with no folder.')
      } catch (error) {
        warnings.push(message(error))
      }
    }
    if (source === 'none' && !cli) {
      warnings.push('The VS Code command line tool was not found, so windows cannot be listed.')
    }
  }

  const index = buildKnownFolderIndex()
  const windows = numberWindows(titles.map(title => toWindow(title, index)))

  return {
    ide: 'vscode',
    label: VSCODE_LABEL,
    installed: running || cli !== null,
    running,
    windows,
    usage: tree.usage,
    source,
    capabilities: {
      focusByTitle: windowControl,
      close: windowControl,
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
