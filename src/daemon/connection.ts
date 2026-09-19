import type { Socket } from 'net'
import type { AttachResult, ControlRequest, ControlResponse, TerminalOpenRequest } from '../shared/terminal'
import {
  FrameDecoder,
  FrameType,
  PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  decodeResize,
  encodeFrame,
  encodeJsonFrame,
  encodeExit,
} from '../shared/node/terminalProtocol'
import type { Registry } from './registry'

type Attachment = {
  sessionId: string
  unsubscribe: () => void
}

/**
 * One connected client. Owns its own ref space, so two clients attached to the
 * same session never collide, and cleans up its subscriptions on close.
 */
export class Connection {
  private readonly decoder = new FrameDecoder()
  private readonly attachments = new Map<number, Attachment>()
  private nextRef = 1
  private handshakeDone = false
  private closed = false

  constructor(
    private readonly socket: Socket,
    private readonly registry: Registry,
    private readonly onActivity: () => void,
    private readonly buildId: string,
    private readonly onShutdownRequest: () => void
  ) {
    socket.on('data', (chunk: Buffer) => this.handleChunk(chunk))
    socket.on('error', () => this.dispose())
    socket.on('close', () => this.dispose())
  }

  private handleChunk(chunk: Buffer): void {
    this.onActivity()
    let frames
    try {
      frames = this.decoder.push(chunk)
    } catch {
      this.socket.destroy()
      return
    }
    for (const frame of frames) {
      try {
        this.handleFrame(frame.type, frame.ref, frame.payload)
      } catch (error) {
        // A malformed frame must not strand the control requests decoded
        // alongside it in the same chunk.
        process.stderr.write(`[pty-daemon] dropped frame type ${frame.type}: ${String(error)}\n`)
      }
    }
  }

  private handleFrame(type: number, ref: number, payload: Buffer): void {
    if (!this.handshakeDone && type !== FrameType.Hello) {
      this.socket.destroy()
      return
    }

    switch (type) {
      case FrameType.Hello:
        return this.handleHello(payload)
      case FrameType.ControlRequest:
        return this.handleControl(payload)
      case FrameType.Input:
        return void this.registry.get(this.attachments.get(ref)?.sessionId ?? '')?.write(payload)
      case FrameType.Resize: {
        if (payload.length < 4) return
        const { cols, rows } = decodeResize(payload)
        return void this.sessionFor(ref)?.resize(cols, rows)
      }
      case FrameType.Ack:
        if (payload.length < 4) return
        return void this.sessionFor(ref)?.acknowledge(payload.readUInt32LE(0))
      case FrameType.Ping:
        return this.send(encodeFrame(FrameType.Pong, 0, Buffer.alloc(0)))
      default:
        return
    }
  }

  private sessionFor(ref: number) {
    const attachment = this.attachments.get(ref)
    return attachment ? this.registry.get(attachment.sessionId) : undefined
  }

  private handleHello(payload: Buffer): void {
    let requested = 0
    try {
      requested = JSON.parse(payload.toString('utf8')).protocolVersion
    } catch {
      this.socket.destroy()
      return
    }

    if (!SUPPORTED_PROTOCOL_VERSIONS.includes(requested)) {
      this.send(encodeJsonFrame(FrameType.HelloAck, 0, {
        ok: false,
        protocolVersion: PROTOCOL_VERSION,
        supported: SUPPORTED_PROTOCOL_VERSIONS,
      }))
      this.socket.end()
      return
    }

    this.handshakeDone = true
    this.send(encodeJsonFrame(FrameType.HelloAck, 0, {
      ok: true,
      protocolVersion: requested,
      pid: process.pid,
      buildId: this.buildId,
      sessions: this.registry.list(),
    }))
  }

  private handleControl(payload: Buffer): void {
    let request: ControlRequest
    try {
      request = JSON.parse(payload.toString('utf8'))
    } catch {
      return
    }

    this.runControl(request)
      .then(result => this.respond({ requestId: request.requestId, ok: true, result }))
      .catch(error => this.respond({
        requestId: request.requestId,
        ok: false,
        error: error instanceof Error ? error.message : 'Control operation failed',
      }))
  }

  private async runControl(request: ControlRequest): Promise<unknown> {
    switch (request.op) {
      case 'list':
        return this.registry.list()
      case 'open': {
        const session = this.registry.open(request.params as TerminalOpenRequest)
        return session.info
      }
      case 'close':
        this.detachSession(request.params.id)
        this.registry.close(request.params.id)
        return null
      case 'rename':
        this.registry.rename(request.params.id, request.params.title)
        return null
      case 'attach':
        return this.attach(request.params.id, request.params.cols, request.params.rows)
      case 'detach':
        this.detachSession(request.params.id, request.params.ref)
        return null
      case 'clear':
        this.registry.get(request.params.id)?.clearScrollback()
        return null
      case 'shutdown':
        // Answer before going away, so the client is not left waiting.
        setTimeout(this.onShutdownRequest, 50)
        return null
      default:
        throw new Error('Unknown control operation')
    }
  }

  private async attach(sessionId: string, cols: number, rows: number): Promise<AttachResult> {
    const session = this.registry.get(sessionId)
    if (!session) throw new Error(`No such session: ${sessionId}`)

    this.detachSession(sessionId)
    session.resize(cols, rows)

    const ref = this.takeRef()
    const unsubscribe = session.subscribe({
      onData: chunk => this.send(encodeFrame(FrameType.Data, ref, chunk)),
      onExit: exitCode => this.send(encodeExit(ref, exitCode)),
    })
    this.attachments.set(ref, { sessionId, unsubscribe })

    // Snapshot first, so the client paints correct state before live output.
    this.send(encodeFrame(FrameType.Snapshot, ref, await session.snapshot()))
    return { ref, session: session.info }
  }

  /**
   * Refs are a u16 on the wire, so the counter has to wrap. Skipping the ones
   * still attached keeps a long-lived connection from handing out a ref that
   * would silently route another session's output.
   */
  private takeRef(): number {
    for (let attempt = 0; attempt < 0xffff; attempt++) {
      const ref = this.nextRef
      this.nextRef = this.nextRef >= 0xffff ? 1 : this.nextRef + 1
      if (!this.attachments.has(ref)) return ref
    }
    throw new Error('No terminal refs available on this connection')
  }

  /**
   * Drops attachments for a session, or just the one named by `only`.
   *
   * The narrow form matters for an attach that lost a race: it must remove its
   * own attachment without touching the newer one that replaced it, which a
   * session-wide detach would also take down.
   */
  private detachSession(sessionId: string, only?: number): void {
    for (const [ref, attachment] of this.attachments) {
      if (attachment.sessionId !== sessionId) continue
      if (only !== undefined && ref !== only) continue
      attachment.unsubscribe()
      this.attachments.delete(ref)
    }
  }

  private respond(response: ControlResponse): void {
    this.send(encodeJsonFrame(FrameType.ControlResponse, 0, response))
  }

  sendEvent(event: unknown): void {
    if (!this.handshakeDone) return
    this.send(encodeJsonFrame(FrameType.ControlEvent, 0, event))
  }

  private send(frame: Buffer): void {
    if (this.closed || this.socket.destroyed) return
    this.socket.write(frame)
  }

  dispose(): void {
    if (this.closed) return
    this.closed = true
    for (const attachment of this.attachments.values()) attachment.unsubscribe()
    this.attachments.clear()
  }
}
