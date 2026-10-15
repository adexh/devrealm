/** IDE window and process facts the main process captures and the renderer reads. */

export type IdeId = 'vscode'

export type IdeWindow = {
  /** `folder:<path>` when the folder is known, else `title:<title>`, so a card keeps its identity while the active editor changes. */
  id: string
  ide: IdeId
  title: string
  /**
   * 1-based position among windows sharing this exact title, in listing order.
   * Two folderless windows can both be called "Welcome — Code"; this is what
   * keeps an action on the second from landing on the first.
   */
  titleIndex: number
  /** The folder or workspace name VS Code shows in the title, when one could be read. */
  rootName: string | null
  /** The directory the window works in: the folder, or a `.code-workspace` file's directory. */
  folderPath: string | null
  /** What to hand the CLI to reach this window: the folder, or the `.code-workspace` file. */
  openPath: string | null
  repoId: string | null
  workspaceId: string | null
  /** VS Code prefixes the title with a dot when the window holds unsaved changes. */
  dirty: boolean
  /** The root name matched more than one known folder, so no path was chosen. */
  ambiguous: boolean
}

export type IdeProcessKind = 'main' | 'renderer' | 'extension-host' | 'gpu' | 'utility' | 'child'

export type IdeProcessGroup = {
  kind: IdeProcessKind
  count: number
  cpuPercent: number
  memoryBytes: number
}

export type IdeUsage = {
  mainPid: number
  processCount: number
  /** Null where the platform gives no per-process CPU sample. */
  cpuPercent: number | null
  memoryBytes: number
  groups: IdeProcessGroup[]
}

/** Where the window titles came from. `none` means the IDE runs but nothing could list its windows. */
export type IdeWindowSource = 'accessibility' | 'cli' | 'none'

export type IdeCapabilities = {
  /** Raise a window whose folder is unknown; needs macOS Accessibility and working Automation. */
  focusByTitle: boolean
  close: boolean
  quit: boolean
}

export type IdeAccessibility = {
  /** True on macOS, where the permission exists at all. */
  supported: boolean
  granted: boolean
}

export type IdeSnapshot = {
  ide: IdeId
  label: string
  installed: boolean
  running: boolean
  windows: IdeWindow[]
  usage: IdeUsage | null
  source: IdeWindowSource
  capabilities: IdeCapabilities
  accessibility: IdeAccessibility
  warnings: string[]
  capturedAt: number
  durationMs: number
}

export type IdeSnapshotOptions = {
  /** Skip the cached `--status` result, after an action that changed the window set. */
  fresh?: boolean
}

export type IdeWindowRef = {
  ide: IdeId
  title: string
  titleIndex: number
  openPath: string | null
}
