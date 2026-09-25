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
import type { Attachment } from './session'
import type { Registry } from './registry'

type RefBinding = {
  sessionId: string
  attachment: Attachment
}

/**
 * One connected client. Owns its own ref space, so two clients attached to the
 * same session never collide, and cleans up its subscriptions on close.
 */
export class Connection {
  private readonly decoder = new FrameDecoder()
  private readonly attachments = new Map<number, RefBinding>()
  private nextRef = 1
  private handshakeDone = false
  private closed = false
  /**
   * Control operations run one at a time. Attach suspends on a write barrier,
   * and a close arriving mid-suspend used to dispose the terminal the attach
   * was waiting on, so its promise never settled and the client's request hung
   * with no timeout behind it.
   */
  private controlQueue: Promise<void> = Promise.resolve()

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
      // A frame may have destroyed the socket; the rest of the batch must not
      // then run on a dead connection, which could open a pty nobody can reach.
      if (this.closed || this.socket.destroyed) return
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
      this.closed = true
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
        return void this.attachments.get(ref)?.attachment.acknowledge(payload.readUInt32LE(0))
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

    this.controlQueue = this.controlQueue.then(() =>
      this.runControl(request)
        .then(result => this.respond({ requestId: request.requestId, ok: true, result }))
        .catch(error => this.respond({
          requestId: request.requestId,
          ok: false,
          error: error instanceof Error ? error.message : 'Control operation failed',
        }))
    )
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

    // Subscribing and taking the snapshot must happen in the same tick. Held
    // frames are then guaranteed to be output that arrived after the snapshot's
    // write barrier, so every byte lands in exactly one of the two and the
    // client never paints the same output twice or misses it.
    let snapshotSent = false
    const held: Buffer[] = []
    const emit = (frame: Buffer) => {
      if (snapshotSent) this.send(frame)
      else held.push(frame)
    }

    const attachment = session.subscribe({
      onData: chunk => emit(encodeFrame(FrameType.Data, ref, chunk)),
      onExit: exitCode => emit(encodeExit(ref, exitCode)),
    })
    this.attachments.set(ref, { sessionId, attachment })

    const snapshot = await session.snapshot()
    this.send(encodeFrame(FrameType.Snapshot, ref, snapshot))
    snapshotSent = true
    for (const frame of held) this.send(frame)

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
    for (const [ref, binding] of this.attachments) {
      if (binding.sessionId !== sessionId) continue
      if (only !== undefined && ref !== only) continue
      binding.attachment.dispose()
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
    for (const binding of this.attachments.values()) binding.attachment.dispose()
    this.attachments.clear()
  }
}
