import { useCallback, useRef } from 'react'
import type { Terminal } from '@xterm/xterm'
import { FlowControl } from '../../../../shared/terminalConstants'
import { attachSession, detachSession, onSessionPort } from '../ipc/terminals'
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
    const size = fit()
    let disposed = false
    let unacknowledged = 0
    // Acks during replay would desynchronise the daemon's counter.
    let inReplay = false

    const offPort = onSessionPort((incomingId, port) => {
      if (incomingId !== sessionId || disposed) return
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
        writeWithAck(terminal, message.b)
      }
      port.start()

      terminal.onData(data => {
        port.postMessage({ t: 'input', b: new TextEncoder().encode(data) })
      })
    })

    function writeWithAck(term: Terminal, bytes: Uint8Array) {
      term.write(bytes, () => {
        if (inReplay) return
        unacknowledged += bytes.length
        if (unacknowledged < FlowControl.CharCountAckSize) return
        portRef.current?.postMessage({ t: 'ack', chars: unacknowledged })
        unacknowledged = 0
      })
    }

    attachSession(sessionId, size.cols, size.rows).catch((error: unknown) => {
      onError(error instanceof Error ? error.message : 'Could not attach to the shell')
    })

    return () => {
      disposed = true
      offPort()
      portRef.current?.close()
      portRef.current = null
      void detachSession(sessionId)
    }
  }, [sessionId, onError])

  const onResize = useCallback((cols: number, rows: number) => {
    portRef.current?.postMessage({ t: 'resize', cols, rows })
  }, [])

  return { onReady, onResize }
}
