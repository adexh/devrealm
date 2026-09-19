import { spawn } from 'child_process'
import { app } from 'electron'
import fs from 'fs'
import net from 'net'
import os from 'os'
import path from 'path'
import type { ControlEvent, ControlOp, TerminalSessionInfo } from '../../shared/terminal'
import { DAEMON_PIPE_NAME, DAEMON_SOCKET_NAME, TERMINAL_DATA_DIR } from '../../shared/terminal'
import {
  FrameDecoder,
  FrameType,
  PROTOCOL_VERSION,
  encodeFrame,
  encodeJsonFrame,
} from '../../shared/node/terminalProtocol'
import { DATA_DIR_NAME } from '../constants'

type HelloAck = {
  ok: boolean
  protocolVersion: number
  pid: number
  buildId?: string
}

type RefHandler = {
  onData: (chunk: Buffer) => void
  onSnapshot: (chunk: Buffer) => void
  onExit: (exitCode: number) => void
}

/** Marks a failure against a daemon that answered but could not be talked to. */
class HandshakeError extends Error {}

const CONNECT_TIMEOUT_MS = 5000
const QUEUED_FRAME_LIMIT = 256

const CONNECT_RETRY_MS = 25
const SHUTDOWN_TIMEOUT_MS = 2000

/**
 * The daemon outlives edits to its own source, so a rebuilt daemon keeps
 * serving the old code until someone kills it by hand. That is how stale
 * env-stripping rules kept reaching shells. Comparing build ids makes the
 * replacement automatic.
 *
 * Unpackaged builds only. In a packaged app a mismatch means an update replaced
 * the bundle, and restarting there would kill the user's running shells; that
 * case wants fd handoff, which is not built.
 *
 * The test is `app.isPackaged` rather than NODE_ENV because only `npm run dev`
 * sets NODE_ENV. Running the same unpackaged build with `npm start` left the
 * check switched off, so the stale daemon it exists to replace survived.
 */
function isReplaceableBuild(): boolean {
  return !app.isPackaged
}

/**
 * Newest mtime of any .js under `dir`, or 0 if there is none.
 *
 * The whole bundle counts, not just the entry point: `tsc -w` re-emits only
 * what changed, so editing shellEnv.ts leaves main.js untouched. An entry-only
 * mtime would call that bundle unchanged, and shellEnv.ts is precisely the file
 * whose stale copy leaked the launcher's environment into shells.
 */
function newestMtime(dir: string): number {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return 0
  }
  let newest = 0
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      newest = Math.max(newest, newestMtime(full))
      continue
    }
    if (!entry.name.endsWith('.js')) continue
    try {
      newest = Math.max(newest, fs.statSync(full).mtimeMs)
    } catch {
      // Removed mid-walk by a rebuild; the next connect sees the settled tree.
    }
  }
  return newest
}

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
  /**
   * Refs whose owner has gone. Frames for them keep arriving until the daemon
   * processes the detach, and queueing those would hold them until the ref
   * number came round again and handed them to its next owner.
   */
  private readonly abandonedRefs = new Set<number>()
  private readonly eventListeners = new Set<(event: ControlEvent) => void>()

  /**
   * Overridable so the smoke tests get a daemon of their own. Left pointing at
   * the real one they would drive the daemon the developer is using, and since
   * a build-id mismatch now replaces it, a smoke run could take down the shells
   * they are working in.
   */
  private readonly dataDir = process.env.DEVREALM_DAEMON_HOME ?? path.join(os.homedir(), DATA_DIR_NAME)
  private readonly socketPath = process.platform === 'win32'
    ? process.env.DEVREALM_DAEMON_PIPE ?? DAEMON_PIPE_NAME
    : path.join(this.dataDir, DAEMON_SOCKET_NAME)

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
    this.abandonedRefs.delete(ref)
    this.refHandlers.set(ref, handler)
    const queued = this.pendingFrames.get(ref)
    if (!queued) return
    this.pendingFrames.delete(ref)
    for (const frame of queued) this.dispatchToRef(handler, frame.type, frame.payload)
  }

  releaseRef(ref: number): void {
    this.refHandlers.delete(ref)
    this.pendingFrames.delete(ref)
    this.abandonedRefs.add(ref)
  }

  private dispatchToRef(handler: RefHandler, type: number, payload: Buffer): void {
    if (type === FrameType.Data) return handler.onData(payload)
    if (type === FrameType.Snapshot) return handler.onSnapshot(payload)
    if (type === FrameType.Exit) return handler.onExit(payload.readInt32LE(0))
  }

  private routeRefFrame(ref: number, type: number, payload: Buffer): void {
    const handler = this.refHandlers.get(ref)
    if (handler) return this.dispatchToRef(handler, type, payload)
    if (this.abandonedRefs.has(ref)) return

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
      await this.restartIfStale()
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
        this.handshake().then(resolve).catch(error => {
          this.abandonSocket(socket)
          reject(new HandshakeError(error instanceof Error ? error.message : String(error)))
        })
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

  /**
   * Drops a socket that never finished its handshake. Its listeners come off
   * first: otherwise its later `close` runs handleDisconnect and tears down
   * whichever connection replaced it, rejecting that one's pending requests and
   * sending onExit(-1) to every live terminal. Clearing `this.socket` also stops
   * ensureConnected reporting a socket that never handshook as connected.
   */
  private abandonSocket(socket: net.Socket): void {
    socket.removeAllListeners()
    socket.destroy()
    if (this.socket !== socket) return
    this.socket = null
    this.daemonBuildId = null
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
    this.abandonedRefs.clear()
  }

  private handshake(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Daemon handshake timed out')), 3000)
      this.handshakeResolver = (ack) => {
        clearTimeout(timer)
        if (!ack?.ok) {
          reject(new Error('Daemon protocol version mismatch'))
          return
        }
        this.daemonBuildId = ack.buildId ?? null
        resolve()
      }
      this.write(encodeJsonFrame(FrameType.Hello, 0, { protocolVersion: PROTOCOL_VERSION }))
    })
  }

  /** Build id of the daemon bundle on disk right now. */
  private currentBuildId(): string {
    const newest = newestMtime(path.dirname(this.daemonEntry()))
    return newest > 0 ? String(newest) : ''
  }

  private daemonEntry(): string {
    // __dirname is dist/main/terminals, the daemon is at dist/daemon.
    return path.join(__dirname, '..', '..', 'daemon', 'main.js')
  }

  /**
   * Replaces a daemon running older code than what is on disk. Sessions it
   * owned are lost, which is acceptable for an unpackaged build and is why it
   * is gated to one.
   */
  private async restartIfStale(): Promise<boolean> {
    if (!isReplaceableBuild()) return false
    const expected = this.currentBuildId()
    if (!expected || !this.daemonBuildId || this.daemonBuildId === expected) return false

    await this.shutdownDaemon()
    this.spawnDaemon()
    await this.connectWithBackoff()
    if (this.daemonBuildId !== expected) {
      // Reconnected to something that is still not the build on disk. Say so
      // rather than run on quietly: the symptom is a shell with the wrong
      // environment, hours away from the cause.
      process.stderr.write(
        `[terminals] daemon reports build ${this.daemonBuildId}, expected ${expected}\n`
      )
    }
    return true
  }

  /**
   * Asks the daemon to exit and waits until it has let go of the socket.
   * Destroying the socket straight after the write dropped the request on the
   * floor, because Node discards queued data on destroy: the old daemon stayed
   * up holding the path, its replacement could not bind, and the backoff
   * reconnected to the same stale daemon with nothing looking wrong.
   */
  private async shutdownDaemon(): Promise<void> {
    const socket = this.socket
    this.socket = null
    this.daemonBuildId = null
    if (!socket || socket.destroyed) return

    await new Promise<void>(resolve => {
      const giveUp = setTimeout(() => { socket.destroy(); resolve() }, SHUTDOWN_TIMEOUT_MS)
      socket.once('close', () => { clearTimeout(giveUp); resolve() })
      // end() flushes the frame before the FIN, unlike destroy().
      socket.end(encodeJsonFrame(FrameType.ControlRequest, 0, { op: 'shutdown', requestId: -1 }))
    })
    await this.waitForSocketFree()
  }

  /** The replacement cannot bind until the old daemon has unlinked the socket. */
  private async waitForSocketFree(): Promise<void> {
    const deadline = Date.now() + SHUTDOWN_TIMEOUT_MS
    while (Date.now() < deadline) {
      const listening = await new Promise<boolean>(resolve => {
        const probe = net.createConnection(this.socketPath)
        probe.once('connect', () => { probe.destroy(); resolve(true) })
        probe.once('error', () => { probe.destroy(); resolve(false) })
      })
      if (!listening) return
      await new Promise(resolve => setTimeout(resolve, CONNECT_RETRY_MS))
    }
  }

  private handshakeResolver: ((ack: HelloAck | null) => void) | null = null
  private daemonBuildId: string | null = null

  private handleChunk(chunk: Buffer): void {
    let frames
    try {
      frames = this.decoder.push(chunk)
    } catch {
      this.socket?.destroy()
      return
    }

    for (const frame of frames) {
      try {
        this.routeFrame(frame)
      } catch (error) {
        // Malformed JSON from whatever is on the socket must not throw out of a
        // socket callback and take the main process with it.
        process.stderr.write(`[terminals] dropped frame type ${frame.type}: ${String(error)}\n`)
      }
    }
  }

  private routeFrame(frame: { type: number; ref: number; payload: Buffer }): void {
    switch (frame.type) {
      case FrameType.HelloAck: {
        this.handshakeResolver?.(JSON.parse(frame.payload.toString('utf8')) as HelloAck)
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

  /**
   * Runs the daemon under the app's own Electron binary in Node mode. That
   * keeps node-pty's native ABI matched and adds no second runtime to the
   * bundle. Detached and unref'd, so it outlives this process.
   */
  private spawnDaemon(): void {
    fs.mkdirSync(this.dataDir, { recursive: true })
    const entry = this.daemonEntry()
    if (!fs.existsSync(entry)) throw new Error(`Terminal daemon build missing at ${entry}`)

    const child = spawn(process.execPath, [
      entry,
      `--build-id=${this.currentBuildId()}`,
      `--socket=${this.socketPath}`,
      `--data-dir=${path.join(this.dataDir, TERMINAL_DATA_DIR)}`,
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
