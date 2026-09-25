import fs from 'fs'
import net from 'net'
import { Connection } from './connection'
import { Registry } from './registry'

/** Exit once nothing is running and nobody is connected for this long. */
const IDLE_SHUTDOWN_MS = 5 * 60 * 1000

export class Server {
  private readonly server: net.Server
  private readonly connections = new Set<Connection>()
  private idleTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly socketPath: string,
    private readonly registry: Registry,
    private readonly buildId: string = ''
  ) {
    this.server = net.createServer(socket => this.handleConnection(socket))
    this.registry.onChange(() => {
      this.broadcastSessions()
      // A shell exiting is what makes the daemon idle, so the countdown starts
      // there rather than from whenever a client last said something.
      this.armIdleTimer()
    })
  }

  async listen(): Promise<void> {
    await this.removeStaleSocket()
    return new Promise((resolve, reject) => {
      this.server.once('error', reject)
      this.server.listen(this.socketPath, () => {
        // The socket's file mode is the whole auth boundary: the daemon trusts
        // whoever can open it. No in-band tokens.
        if (process.platform !== 'win32') {
          try { fs.chmodSync(this.socketPath, 0o600) } catch { /* best effort */ }
        }
        this.armIdleTimer()
        resolve()
      })
    })
  }

  /**
   * Only removes a socket nothing is listening on. Unlinking unconditionally
   * would let a second daemon take the path while the first keeps running,
   * leaving an orphan holding every pty with no client able to reach it.
   */
  private removeStaleSocket(): Promise<void> {
    if (process.platform === 'win32') return Promise.resolve()
    if (!fs.existsSync(this.socketPath)) return Promise.resolve()

    return new Promise(resolve => {
      const probe = net.createConnection(this.socketPath)
      const giveUp = setTimeout(() => { probe.destroy(); finish(false) }, 500)

      function finish(alive: boolean) {
        clearTimeout(giveUp)
        probe.removeAllListeners()
        probe.destroy()
        resolve(alive)
      }
      probe.once('connect', () => finish(true))
      probe.once('error', () => finish(false))
    }).then(alive => {
      if (alive) throw new Error(`Another daemon is already listening on ${this.socketPath}`)
      try { fs.unlinkSync(this.socketPath) } catch { /* raced with its owner exiting */ }
    })
  }

  private handleConnection(socket: net.Socket): void {
    socket.setNoDelay(true)
    const connection = new Connection(
      socket,
      this.registry,
      () => this.armIdleTimer(),
      this.buildId,
      () => this.shutdown(0)
    )
    this.connections.add(connection)
    socket.on('close', () => {
      this.connections.delete(connection)
      this.armIdleTimer()
    })
    this.armIdleTimer()
  }

  private broadcastSessions(): void {
    const event = { event: 'sessions-changed', sessions: this.registry.list() }
    for (const connection of this.connections) connection.sendEvent(event)
  }

  /**
   * Idle shutdown only when there is genuinely nothing to hold on to. A live
   * session keeps the daemon alive even with no client attached, which is the
   * entire point of it outliving the app.
   */
  private armIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => {
      if (this.connections.size > 0 || this.registry.liveCount > 0) {
        this.armIdleTimer()
        return
      }
      this.shutdown(0)
    }, IDLE_SHUTDOWN_MS)
    this.idleTimer.unref()
  }

  shutdown(code: number): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    for (const connection of this.connections) connection.dispose()
    this.registry.disposeAll()
    this.server.close(() => process.exit(code))
    setTimeout(() => process.exit(code), 2000).unref()
  }
}
