import type { AttachResult, ControlEvent, TerminalOpenRequest, TerminalSessionInfo } from '../../../../shared/terminal'
import { TERMINAL_PORT_MESSAGE } from '../../../../shared/terminal'

export function listSessions(): Promise<TerminalSessionInfo[]> {
  return window.electronAPI.terminals.list()
}

export function openSession(request: TerminalOpenRequest): Promise<TerminalSessionInfo> {
  return window.electronAPI.terminals.open(request)
}

export function closeSession(id: string): Promise<void> {
  return window.electronAPI.terminals.close(id)
}

export function renameSession(id: string, title: string): Promise<void> {
  return window.electronAPI.terminals.rename({ id, title })
}

export function attachSession(id: string, cols: number, rows: number): Promise<AttachResult> {
  return window.electronAPI.terminals.attach({ id, cols, rows })
}

export function detachSession(id: string): Promise<void> {
  return window.electronAPI.terminals.detach(id)
}

export function clearSession(id: string): Promise<void> {
  return window.electronAPI.terminals.clear(id)
}

/**
 * Receives the live MessagePort for a session.
 *
 * The port arrives via window.postMessage rather than the electronAPI bridge,
 * because contextBridge clones its arguments and a cloned MessagePort is inert.
 * Preload transfers the real one into this world; see src/main/preload.ts.
 */
export function onSessionPort(cb: (sessionId: string, port: MessagePort) => void): () => void {
  function handler(event: MessageEvent) {
    if (event.source !== window) return
    const data = event.data as { type?: string; sessionId?: string } | null
    if (!data || data.type !== TERMINAL_PORT_MESSAGE || !data.sessionId) return
    const port = event.ports[0]
    if (port) cb(data.sessionId, port)
  }
  window.addEventListener('message', handler)
  return () => window.removeEventListener('message', handler)
}

export function onDaemonEvent(cb: (event: ControlEvent) => void): () => void {
  return window.electronAPI.terminals.onEvent(cb)
}
