import type { TerminalSession } from '../types'

/**
 * Daemon-backed session control. The PTY daemon is not built yet, so these
 * resolve against in-memory state; the call sites and signatures are final so
 * only the bodies change when the daemon lands.
 *
 * Hot-path traffic (input, output, resize) never appears here on purpose. It
 * travels over a MessagePort, not through these control calls.
 */

export function listSessions(): Promise<TerminalSession[]> {
  return Promise.resolve([])
}

export function createSession(data: {
  workspaceId: string
  repoId: string | null
  cwd: string
  cols: number
  rows: number
}): Promise<string> {
  void data
  return Promise.resolve(makeSessionId())
}

export function closeSession(sessionId: string): Promise<void> {
  void sessionId
  return Promise.resolve()
}

export function renameSession(sessionId: string, title: string): Promise<void> {
  void sessionId
  void title
  return Promise.resolve()
}

export function makeSessionId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}
