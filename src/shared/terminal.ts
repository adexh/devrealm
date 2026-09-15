/** Session facts the daemon owns and every client reads. */
export type TerminalSessionInfo = {
  id: string
  workspaceId: string
  repoId: string | null
  repoName: string
  title: string
  cwd: string
  shell: string
  cols: number
  rows: number
  pid: number
  /** Set once the shell exits; the session stays listed so its output survives. */
  exitCode: number | null
  createdAt: number
  lastActiveAt: number
}

export type TerminalOpenRequest = {
  workspaceId: string
  repoId: string | null
  repoName: string
  title: string
  cwd: string
  cols: number
  rows: number
  shell?: string
}

export type ControlOp =
  | { op: 'list' }
  | { op: 'open'; params: TerminalOpenRequest }
  | { op: 'close'; params: { id: string } }
  | { op: 'rename'; params: { id: string; title: string } }
  | { op: 'attach'; params: { id: string; cols: number; rows: number } }
  | { op: 'detach'; params: { id: string } }
  | { op: 'shutdown' }

export type ControlRequest = ControlOp & { requestId: number }

export type ControlResponse =
  | { requestId: number; ok: true; result: unknown }
  | { requestId: number; ok: false; error: string }

export type AttachResult = { ref: number; session: TerminalSessionInfo }

/** Pushed by the daemon when the session list changes for any reason. */
export type ControlEvent =
  | { event: 'sessions-changed'; sessions: TerminalSessionInfo[] }
  | { event: 'exit'; id: string; exitCode: number }

/** Tag for the window.postMessage that carries a session's MessagePort. */
export const TERMINAL_PORT_MESSAGE = 'devrealm:terminal-port'

export const DAEMON_SOCKET_NAME = 'term.sock'
export const DAEMON_PIPE_NAME = '\\\\.\\pipe\\devrealm-term'
export const DAEMON_LOCK_NAME = 'term.daemon.lock'
export const TERMINAL_DATA_DIR = 'terminals'

/** Scrollback the daemon keeps per session for reattach snapshots. */
export const SNAPSHOT_SCROLLBACK_LINES = 5000
