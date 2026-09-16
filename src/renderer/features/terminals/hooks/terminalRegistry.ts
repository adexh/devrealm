import type { XtermHandle } from '../../../components/XtermHost'

/**
 * Live xterm instances, keyed by session id.
 *
 * Deliberately module state rather than React state or zustand: terminal output
 * must never trigger a render, and a Terminal is not serialisable. Toolbar
 * actions such as clear need to reach the focused instance, and this is how.
 */
const terminals = new Map<string, XtermHandle>()

export function registerTerminal(sessionId: string, handle: XtermHandle): void {
  terminals.set(sessionId, handle)
}

export function unregisterTerminal(sessionId: string): void {
  terminals.delete(sessionId)
}

export function getTerminal(sessionId: string | null): XtermHandle | undefined {
  return sessionId ? terminals.get(sessionId) : undefined
}
