import { MessageChannelMain, type MessagePortMain, type WebContents } from 'electron'
import type { AttachResult } from '../../shared/terminal'
import { encodeAck, encodeResize } from '../../shared/node/terminalProtocol'
import { daemonClient } from './daemonClient'

export const TERMINAL_PORT_CHANNEL = 'terminals:port'

type PortMessage =
  | { t: 'input'; b: Uint8Array }
  | { t: 'resize'; cols: number; rows: number }
  | { t: 'ack'; chars: number }

const openPorts = new Map<string, { port: MessagePortMain; ref: number }>()

/**
 * Attaches a session and hands the renderer a dedicated MessagePort for it.
 *
 * Once the port is open, PTY bytes never touch `ipcMain` again, so terminal
 * output does not serialise behind the rest of the app's IPC traffic.
 *
 * Note: Electron's MessagePortMain only accepts MessagePortMain values in its
 * transfer list, so the byte payloads here are structured-cloned rather than
 * transferred. That is still a plain memcpy and keeps main free of any decode.
 */
export async function attachSession(
  webContents: WebContents,
  sessionId: string,
  cols: number,
  rows: number
): Promise<AttachResult> {
  detachSession(sessionId)

  const result = await daemonClient.control<AttachResult>({
    op: 'attach',
    params: { id: sessionId, cols, rows },
  })

  const { port1, port2 } = new MessageChannelMain()
  openPorts.set(sessionId, { port: port1, ref: result.ref })

  daemonClient.registerRef(result.ref, {
    onSnapshot: chunk => port1.postMessage({ t: 'snapshot', b: new Uint8Array(chunk) }),
    onData: chunk => port1.postMessage({ t: 'data', b: new Uint8Array(chunk) }),
    onExit: exitCode => port1.postMessage({ t: 'exit', code: exitCode }),
  })

  port1.on('message', event => {
    const message = event.data as PortMessage
    switch (message.t) {
      case 'input':
        return daemonClient.sendInput(result.ref, Buffer.from(message.b))
      case 'resize':
        return daemonClient.sendFrame(encodeResize(result.ref, message.cols, message.rows))
      case 'ack':
        return daemonClient.sendFrame(encodeAck(result.ref, message.chars))
    }
  })
  port1.start()

  webContents.postMessage(TERMINAL_PORT_CHANNEL, { sessionId }, [port2])
  return result
}

export function detachSession(sessionId: string): void {
  const open = openPorts.get(sessionId)
  if (!open) return
  openPorts.delete(sessionId)
  daemonClient.releaseRef(open.ref)
  try { open.port.close() } catch { /* already closed */ }
}

export function detachAll(): void {
  for (const sessionId of [...openPorts.keys()]) detachSession(sessionId)
}
