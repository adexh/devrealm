/** IDE window and process facts the main process captures and the renderer reads. */

export type IdeId = 'vscode'

export type IdeWindow = {
  /** `folder:<path>` when the folder is known, else `title:<title>`, so a card keeps its identity while the active editor changes. */
  id: string
  ide: IdeId
  title: string
  /** The folder or workspace name VS Code shows in the title, when one could be read. */
  rootName: string | null
  folderPath: string | null
  repoId: string | null
  workspaceId: string | null
  /** VS Code prefixes the title with a dot when the window holds unsaved changes. */
  dirty: boolean
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
  cpuPercent: number
  memoryBytes: number
  groups: IdeProcessGroup[]
}

/** Where the window titles came from. `none` means the IDE runs but nothing could list its windows. */
export type IdeWindowSource = 'accessibility' | 'cli' | 'none'

export type IdeCapabilities = {
  /** Raise a window whose folder is unknown; needs macOS Accessibility. */
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

export type IdeWindowRef = {
  ide: IdeId
  title: string
  folderPath: string | null
}
