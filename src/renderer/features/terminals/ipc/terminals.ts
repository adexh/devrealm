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

const portSubscribers = new Map<string, (port: MessagePort) => void>()
let portListenerAttached = false

function deliverPort(event: MessageEvent) {
  if (event.source !== window) return
  const data = event.data as { type?: string; sessionId?: string } | null
  if (!data || data.type !== TERMINAL_PORT_MESSAGE || !data.sessionId) return
  const port = event.ports[0]
  if (!port) return
  const subscriber = portSubscribers.get(data.sessionId)
  if (!subscriber) {
    port.close()
    return
  }
  subscriber(port)
}

/**
 * The port arrives via window.postMessage rather than the electronAPI bridge,
 * because contextBridge clones its arguments and a cloned MessagePort is inert.
 * Preload transfers the real one into this world; see src/main/preload.ts.
 *
 * Routing is by session id through a single window listener. With a split view
 * every visible pane is attached at once, and a per-pane listener that closed
 * ports addressed to other sessions would kill its sibling's port.
 */
export function onSessionPort(sessionId: string, cb: (port: MessagePort) => void): () => void {
  portSubscribers.set(sessionId, cb)
  if (!portListenerAttached) {
    window.addEventListener('message', deliverPort)
    portListenerAttached = true
  }
  return () => {
    // A remount of the same session registers before the old one cleans up.
    if (portSubscribers.get(sessionId) === cb) portSubscribers.delete(sessionId)
  }
}

export function onDaemonEvent(cb: (event: ControlEvent) => void): () => void {
  return window.electronAPI.terminals.onEvent(cb)
}
