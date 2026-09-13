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

export type TerminalSession = {
  id: string
  workspaceId: string
  workspaceName: string
  repoId: string | null
  repoName: string
  /** Editable tab label, e.g. "vault: next-dev". */
  title: string
  cwd: string
  shell: string
  state: SessionState
  /** Overrides the state's default chip text, e.g. "TESTING". */
  statusLabel?: string
  /** One-line description of what the shell is doing. */
  subtitle?: string
  /** Port a dev server bound in this session, surfaced as a clickable URL. */
  boundPort?: number
  stats: SessionStat[]
  createdAt: number
  lastActiveAt: number
}

/** Sessions bucketed by the workspace they belong to. Group name = workspace name. */
export type SessionGroup = {
  workspaceId: string
  workspaceName: string
  sessions: TerminalSession[]
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

export type LaunchTargetGroup = {
  workspaceId: string
  workspaceName: string
  targets: LaunchTarget[]
}

export type DrawerFilter = 'all' | 'open' | 'recent'
