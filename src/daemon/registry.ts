import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import type { TerminalOpenRequest, TerminalSessionInfo } from '../shared/terminal'
import { Session } from './session'
import { loginShellArgs, resolveCwd, resolveShell, sanitizeEnv } from './shellEnv'

/**
 * Every live session, plus a manifest on disk so a daemon restart can still
 * describe what was running before it died.
 */
export class Registry {
  private readonly sessions = new Map<string, Session>()
  private readonly manifestPath: string
  private listeners = new Set<() => void>()

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true })
    this.manifestPath = path.join(dataDir, 'manifest.json')
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private notify(): void {
    this.writeManifest()
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
    session.subscribe({
      onData: () => { /* registry does not read output */ },
      onExit: () => this.notify(),
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
    this.notify()
  }

  rename(id: string, title: string): void {
    this.sessions.get(id)?.rename(title)
    this.notify()
  }

  list(): TerminalSessionInfo[] {
    return [...this.sessions.values()].map(session => session.info)
  }

  get size(): number {
    return this.sessions.size
  }

  disposeAll(): void {
    for (const session of this.sessions.values()) session.dispose()
    this.sessions.clear()
    this.writeManifest()
  }

  /** Atomic write, so a crash mid-write cannot leave a truncated manifest. */
  private writeManifest(): void {
    const temporary = `${this.manifestPath}.tmp`
    try {
      fs.writeFileSync(temporary, JSON.stringify({ sessions: this.list() }, null, 2))
      fs.renameSync(temporary, this.manifestPath)
    } catch {
      // A manifest we cannot write is not worth killing sessions over.
    }
  }
}
