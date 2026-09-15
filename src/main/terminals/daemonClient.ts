import { spawn } from 'child_process'
import fs from 'fs'
import net from 'net'
import os from 'os'
import path from 'path'
import type { ControlEvent, ControlOp, TerminalSessionInfo } from '../../shared/terminal'
import { DAEMON_PIPE_NAME, DAEMON_SOCKET_NAME } from '../../shared/terminal'
import {
  FrameDecoder,
  FrameType,
  PROTOCOL_VERSION,
  encodeFrame,
  encodeJsonFrame,
} from '../../shared/node/terminalProtocol'
import { DATA_DIR_NAME } from '../constants'

type RefHandler = {
  onData: (chunk: Buffer) => void
  onSnapshot: (chunk: Buffer) => void
  onExit: (exitCode: number) => void
}

const CONNECT_TIMEOUT_MS = 5000
const QUEUED_FRAME_LIMIT = 256
const DB_FILE_NAME = 'devrealm.db'
const CONNECT_RETRY_MS = 25

/**
 * Client for the PTY daemon. Spawns it on first use, reconnects if it went
 * away, and routes frames to whoever attached each ref.
 */
export class DaemonClient {
  private socket: net.Socket | null = null
  private connecting: Promise<void> | null = null
  private decoder = new FrameDecoder()
  private nextRequestId = 1
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  private readonly refHandlers = new Map<number, RefHandler>()
  /**
   * The daemon writes a session's snapshot as soon as it processes an attach,
   * which is before the attach control response, so frames can arrive for a ref
   * whose handler is not registered yet. Hold them until it is.
   */
  private readonly pendingFrames = new Map<number, { type: number; payload: Buffer }[]>()
  private readonly eventListeners = new Set<(event: ControlEvent) => void>()

  private readonly dataDir = path.join(os.homedir(), DATA_DIR_NAME)
  private readonly socketPath = process.platform === 'win32'
    ? DAEMON_PIPE_NAME
    : path.join(os.homedir(), DATA_DIR_NAME, DAEMON_SOCKET_NAME)

  onEvent(listener: (event: ControlEvent) => void): () => void {
    this.eventListeners.add(listener)
    return () => { this.eventListeners.delete(listener) }
  }

  async control<T>(operation: ControlOp): Promise<T> {
    await this.ensureConnected()
    const requestId = this.nextRequestId++
    return new Promise<T>((resolve, reject) => {
      this.pending.set(requestId, { resolve: resolve as (value: unknown) => void, reject })
      this.write(encodeJsonFrame(FrameType.ControlRequest, 0, { ...operation, requestId }))
    })
  }

  registerRef(ref: number, handler: RefHandler): void {
    this.refHandlers.set(ref, handler)
    const queued = this.pendingFrames.get(ref)
    if (!queued) return
    this.pendingFrames.delete(ref)
    for (const frame of queued) this.dispatchToRef(handler, frame.type, frame.payload)
  }

  releaseRef(ref: number): void {
    this.refHandlers.delete(ref)
    this.pendingFrames.delete(ref)
  }

  private dispatchToRef(handler: RefHandler, type: number, payload: Buffer): void {
    if (type === FrameType.Data) return handler.onData(payload)
    if (type === FrameType.Snapshot) return handler.onSnapshot(payload)
    if (type === FrameType.Exit) return handler.onExit(payload.readInt32LE(0))
  }

  private routeRefFrame(ref: number, type: number, payload: Buffer): void {
    const handler = this.refHandlers.get(ref)
    if (handler) return this.dispatchToRef(handler, type, payload)

    const queue = this.pendingFrames.get(ref) ?? []
    // Bounded, so a ref that never registers cannot grow without limit.
    if (queue.length >= QUEUED_FRAME_LIMIT) queue.shift()
    queue.push({ type, payload })
    this.pendingFrames.set(ref, queue)
  }

  sendInput(ref: number, data: Buffer): void {
    this.write(encodeFrame(FrameType.Input, ref, data))
  }

  sendFrame(frame: Buffer): void {
    this.write(frame)
  }

  private write(frame: Buffer): void {
    if (!this.socket || this.socket.destroyed) return
    this.socket.write(frame)
  }

  async ensureConnected(): Promise<void> {
    if (this.socket && !this.socket.destroyed) return
    if (this.connecting) return this.connecting
    this.connecting = this.connectOrSpawn().finally(() => { this.connecting = null })
    return this.connecting
  }

  private async connectOrSpawn(): Promise<void> {
    try {
      await this.connectOnce()
      return
    } catch {
      // Nothing listening. Either the daemon is not running, or the socket file
      // is stale from an unclean exit; spawning handles both.
    }
    this.spawnDaemon()
    await this.connectWithBackoff()
  }

  private connectOnce(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(this.socketPath)
      socket.setNoDelay(true)
      const onError = (error: Error) => { socket.destroy(); reject(error) }
      socket.once('error', onError)
      socket.once('connect', () => {
        socket.off('error', onError)
        this.adoptSocket(socket)
        this.handshake().then(resolve).catch(reject)
      })
    })
  }

  private async connectWithBackoff(): Promise<void> {
    const deadline = Date.now() + CONNECT_TIMEOUT_MS
    let lastError: unknown
    while (Date.now() < deadline) {
      try {
        await this.connectOnce()
        return
      } catch (error) {
        lastError = error
        await new Promise(resolve => setTimeout(resolve, CONNECT_RETRY_MS))
      }
    }
    throw new Error(`Could not reach the terminal daemon: ${String(lastError)}`)
  }

  private adoptSocket(socket: net.Socket): void {
    this.socket = socket
    this.decoder = new FrameDecoder()
    socket.on('data', (chunk: Buffer) => this.handleChunk(chunk))
    socket.on('close', () => this.handleDisconnect())
    socket.on('error', () => this.handleDisconnect())
  }

  private handleDisconnect(): void {
    this.socket = null
    for (const { reject } of this.pending.values()) reject(new Error('Terminal daemon disconnected'))
    this.pending.clear()
    for (const handler of this.refHandlers.values()) handler.onExit(-1)
    this.refHandlers.clear()
    this.pendingFrames.clear()
  }

  private handshake(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Daemon handshake timed out')), 3000)
      const onAck = (ok: boolean) => {
        clearTimeout(timer)
        ok ? resolve() : reject(new Error('Daemon protocol version mismatch'))
      }
      this.handshakeResolver = onAck
      this.write(encodeJsonFrame(FrameType.Hello, 0, { protocolVersion: PROTOCOL_VERSION }))
    })
  }

  private handshakeResolver: ((ok: boolean) => void) | null = null

  private handleChunk(chunk: Buffer): void {
    let frames
    try {
      frames = this.decoder.push(chunk)
    } catch {
      this.socket?.destroy()
      return
    }

    for (const frame of frames) {
      switch (frame.type) {
        case FrameType.HelloAck: {
          const body = JSON.parse(frame.payload.toString('utf8'))
          this.handshakeResolver?.(Boolean(body.ok))
          this.handshakeResolver = null
          break
        }
        case FrameType.ControlResponse: {
          const body = JSON.parse(frame.payload.toString('utf8'))
          const waiter = this.pending.get(body.requestId)
          if (!waiter) break
          this.pending.delete(body.requestId)
          body.ok ? waiter.resolve(body.result) : waiter.reject(new Error(body.error))
          break
        }
        case FrameType.ControlEvent: {
          const body = JSON.parse(frame.payload.toString('utf8')) as ControlEvent
          for (const listener of this.eventListeners) listener(body)
          break
        }
        case FrameType.Data:
        case FrameType.Snapshot:
        case FrameType.Exit:
          this.routeRefFrame(frame.ref, frame.type, frame.payload)
          break
        default:
          break
      }
    }
  }

  /**
   * Runs the daemon under the app's own Electron binary in Node mode. That
   * keeps node-pty's native ABI matched and adds no second runtime to the
   * bundle. Detached and unref'd, so it outlives this process.
   */
  private spawnDaemon(): void {
    fs.mkdirSync(this.dataDir, { recursive: true })
    // __dirname is dist/main/terminals, the daemon is at dist/daemon.
    const entry = path.join(__dirname, '..', '..', 'daemon', 'main.js')
    if (!fs.existsSync(entry)) throw new Error(`Terminal daemon build missing at ${entry}`)

    const child = spawn(process.execPath, [
      entry,
      `--socket=${this.socketPath}`,
      `--db=${path.join(this.dataDir, DB_FILE_NAME)}`,
    ], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      detached: true,
      stdio: 'ignore',
    })
    child.unref()
  }

  async listSessions(): Promise<TerminalSessionInfo[]> {
    return this.control<TerminalSessionInfo[]>({ op: 'list' })
  }
}

export const daemonClient = new DaemonClient()
