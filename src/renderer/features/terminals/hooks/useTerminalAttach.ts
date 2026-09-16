import { useCallback, useRef } from 'react'
import { FlowControl } from '../../../../shared/terminalConstants'
import { attachSession, detachSession, onSessionPort } from '../ipc/terminals'
import { registerTerminal, unregisterTerminal } from './terminalRegistry'
import type { XtermHandle } from '../../../components/XtermHost'

type PortIn =
  | { t: 'snapshot'; b: Uint8Array }
  | { t: 'data'; b: Uint8Array }
  | { t: 'exit'; code: number }

/**
 * Connects one xterm instance to its daemon session over a MessagePort, and
 * runs the client half of flow control.
 */
export function useTerminalAttach(sessionId: string, onError: (message: string) => void) {
  const portRef = useRef<MessagePort | null>(null)

  const onReady = useCallback((handle: XtermHandle) => {
    const { terminal, fit } = handle
    registerTerminal(sessionId, handle)
    const size = fit()
    const encoder = new TextEncoder()
    let disposed = false
    let unacknowledged = 0
    // Acks during replay would desynchronise the daemon's counter.
    let inReplay = false

    // Registered once, not per port, so a reconnect cannot stack handlers.
    const inputSubscription = terminal.onData(data => {
      portRef.current?.postMessage({ t: 'input', b: encoder.encode(data) })
    })

    function writeWithAck(bytes: Uint8Array) {
      terminal.write(bytes, () => {
        if (inReplay) return
        unacknowledged += bytes.length
        if (unacknowledged < FlowControl.CharCountAckSize) return
        portRef.current?.postMessage({ t: 'ack', chars: unacknowledged })
        unacknowledged = 0
      })
    }

    const offPort = onSessionPort((incomingId, port) => {
      if (incomingId !== sessionId || disposed) {
        port.close()
        return
      }
      portRef.current = port

      port.onmessage = event => {
        const message = event.data as PortIn
        if (message.t === 'exit') {
          terminal.write(`\r\n\x1b[90m[process exited with code ${message.code}]\x1b[0m\r\n`)
          return
        }
        if (message.t === 'snapshot') {
          inReplay = true
          terminal.write(message.b, () => { inReplay = false })
          return
        }
        writeWithAck(message.b)
      }
      port.start()
    })

    attachSession(sessionId, size.cols, size.rows).catch((error: unknown) => {
      onError(error instanceof Error ? error.message : 'Could not attach to the shell')
    })

    // Nothing here may throw: this runs inside a React effect cleanup, and an
    // exception during unmount tears down the tree.
    return () => {
      disposed = true
      unregisterTerminal(sessionId)
      try { offPort() } catch { /* listener already gone */ }
      try { inputSubscription.dispose() } catch { /* terminal already disposed */ }
      try { portRef.current?.close() } catch { /* port already closed */ }
      portRef.current = null
      void detachSession(sessionId).catch(() => { /* daemon already dropped it */ })
    }
  }, [sessionId, onError])

  const onResize = useCallback((cols: number, rows: number) => {
    try {
      portRef.current?.postMessage({ t: 'resize', cols, rows })
    } catch {
      // Port closed between the resize observer firing and this call.
    }
  }, [])

  return { onReady, onResize }
}
