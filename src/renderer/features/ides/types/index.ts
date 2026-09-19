import type { IdeWindow } from '../../../../shared/ide'
import type { Repo } from '../../../../shared/types'

/** A window as the cards show it: daemon facts plus names resolved from the workspace store. */
export type IdeWindowView = IdeWindow & {
  repoName: string | null
  folderLabel: string | null
}

/** A tracked repo with a local path and no window holding it. */
export type IdeUnopenedRepo = {
  repo: Repo
  path: string
}

export type IdeWindowGroup = {
  key: string
  /** Null for the group of windows no workspace tracks. */
  workspaceId: string | null
  name: string
  windows: IdeWindowView[]
  unopened: IdeUnopenedRepo[]
}

export type IdeActionKind = 'focus' | 'close' | 'terminal' | 'open' | 'quit'

export type IdeActionState = {
  kind: IdeActionKind
  /** Window id or repo id, whichever the action targets. */
  targetId: string
}
