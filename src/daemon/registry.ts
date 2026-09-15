import fs from 'fs'
import { randomUUID } from 'crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { TerminalOpenRequest, TerminalSessionInfo } from '../shared/terminal'
import { openDatabase } from '../shared/node/db'
import { Session } from './session'
import { loginShellArgs, resolveCwd, resolveShell, sanitizeEnv } from './shellEnv'

type SessionRow = {
  id: string
  workspace_id: string
  repo_id: string | null
  repo_name: string
  title: string
  cwd: string
  shell: string
  cols: number
  rows: number
  pid: number
  exit_code: number | null
  created_at: number
  last_active_at: number
}

/**
 * Every live session, mirrored into SQLite so other processes can see what is
 * running without going through the socket.
 */
export class Registry {
  private readonly sessions = new Map<string, Session>()
  private readonly db: DatabaseSync
  private listeners = new Set<() => void>()

  constructor(dbPath?: string) {
    this.db = openDatabase(dbPath)
    // The daemon owns every pty, so any row that outlived it is describing a
    // process that no longer exists. Clearing them keeps the table honest.
    const cleared = this.db.prepare('DELETE FROM terminal_sessions').run()
    if (cleared.changes > 0) {
      process.stderr.write(`[pty-daemon] cleared ${cleared.changes} stale session row(s)\n`)
    }
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }

  open(request: TerminalOpenRequest): Session {
    const shell = resolveShell(request.shell)
    const cwd = resolveCwd(request.cwd)
    if (!fs.existsSync(cwd)) throw new Error(`Directory does not exist: ${cwd}`)

    const session = new Session(
      randomUUID(),
      { ...request, cwd },
      shell,
      sanitizeEnv(process.env),
      loginShellArgs(shell)
    )

    this.sessions.set(session.id, session)
    this.persist(session.info)
    session.subscribe({
      onData: () => { /* registry does not read output */ },
      onExit: () => { this.persist(session.info); this.notify() },
    })
    this.notify()
    return session
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id)
  }

  close(id: string): void {
    const session = this.sessions.get(id)
    if (!session) return
    session.dispose()
    this.sessions.delete(id)
    this.db.prepare('DELETE FROM terminal_sessions WHERE id = ?').run(id)
    this.notify()
  }

  rename(id: string, title: string): void {
    const session = this.sessions.get(id)
    if (!session) return
    session.rename(title)
    this.persist(session.info)
    this.notify()
  }

  list(): TerminalSessionInfo[] {
    return [...this.sessions.values()].map(session => session.info)
  }

  /** What SQLite holds, for anything reading the registry out of process. */
  listPersisted(): TerminalSessionInfo[] {
    const rows = this.db
      .prepare('SELECT * FROM terminal_sessions ORDER BY created_at')
      .all() as SessionRow[]

    return rows.map(row => ({
      id: row.id,
      workspaceId: row.workspace_id,
      repoId: row.repo_id,
      repoName: row.repo_name,
      title: row.title,
      cwd: row.cwd,
      shell: row.shell,
      cols: row.cols,
      rows: row.rows,
      pid: row.pid,
      exitCode: row.exit_code,
      createdAt: row.created_at,
      lastActiveAt: row.last_active_at,
    }))
  }

  get size(): number {
    return this.sessions.size
  }

  disposeAll(): void {
    for (const session of this.sessions.values()) session.dispose()
    this.sessions.clear()
    this.db.prepare('DELETE FROM terminal_sessions').run()
  }

  private persist(info: TerminalSessionInfo): void {
    this.db.prepare(`
      INSERT INTO terminal_sessions (
        id, workspace_id, repo_id, repo_name, title, cwd, shell,
        cols, rows, pid, exit_code, created_at, last_active_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title          = excluded.title,
        cols           = excluded.cols,
        rows           = excluded.rows,
        exit_code      = excluded.exit_code,
        last_active_at = excluded.last_active_at
    `).run(
      info.id, info.workspaceId, info.repoId, info.repoName, info.title, info.cwd, info.shell,
      info.cols, info.rows, info.pid, info.exitCode, info.createdAt, info.lastActiveAt
    )
  }
}
