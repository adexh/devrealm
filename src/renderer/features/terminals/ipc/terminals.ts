import type { AttachResult, ControlEvent, TerminalOpenRequest, TerminalSessionInfo } from '../../../../shared/terminal'

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

/** Resolves with the MessagePort the main process opens for a session. */
export function onSessionPort(cb: (sessionId: string, port: MessagePort) => void): () => void {
  return window.electronAPI.terminals.onPort(cb)
}

export function onDaemonEvent(cb: (event: ControlEvent) => void): () => void {
  return window.electronAPI.terminals.onEvent(cb)
}
