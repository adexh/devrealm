import type { IdeWindow } from '../../../../shared/ide'

/** A window as the screens show it: daemon facts plus names resolved from the workspace store. */
export type IdeWindowView = IdeWindow & {
  repoName: string | null
  folderLabel: string | null
}

export type IdeWindowGroup = {
  key: string
  /** Null for the group of windows no workspace tracks. */
  workspaceId: string | null
  name: string
  windows: IdeWindowView[]
}

export type IdeActionKind = 'focus' | 'close' | 'terminal' | 'quit'

export type IdeActionState = {
  kind: IdeActionKind
  /** The window id, or the IDE id for quit. */
  targetId: string
}

/** A window as the table shows it: the workspace becomes a column, not a heading. */
export type IdeWindowRow = IdeWindowView & {
  workspaceName: string
}

export type IdeSortColumn = 'window' | 'title' | 'workspace' | 'path'

export type IdeSortState = {
  column: IdeSortColumn
  direction: 'asc' | 'desc'
}
