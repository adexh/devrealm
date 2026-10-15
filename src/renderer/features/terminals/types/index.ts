import type { TerminalSessionInfo } from '../../../../shared/terminal'

export type SessionState =
  | 'booting'
  | 'running'
  | 'working'
  | 'idle'
  | 'exited'
  | 'failed'

export type StatTone = 'ok' | 'warn' | 'dim' | 'err'

/** One small metric shown in a session card's footer row. */
export type SessionStat = {
  label: string
  tone?: StatTone
}

/** Daemon session facts, plus the workspace name resolved for display. */
export type TerminalSession = TerminalSessionInfo & {
  workspaceName: string
  state: SessionState
  statusLabel?: string
  subtitle?: string
  boundPort?: number
  stats: SessionStat[]
}

/** A launchable target in the repo drawer: a registered repo or a plain folder. */
export type LaunchTarget = {
  id: string
  workspaceId: string
  name: string
  path: string
  kind: 'repo' | 'folder'
  branch?: string
  openCount: number
  hasLocalPath: boolean
}

export type DrawerFilter = 'all' | 'open' | 'recent'
