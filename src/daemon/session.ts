import * as pty from 'node-pty'
import { Terminal as HeadlessTerminal } from '@xterm/headless'
import { SerializeAddon } from '@xterm/addon-serialize'
import type { TerminalOpenRequest, TerminalSessionInfo } from '../shared/terminal'
import { SNAPSHOT_SCROLLBACK_LINES } from '../shared/terminal'
import { Coalesce, FlowControl } from '../shared/node/terminalProtocol'

type Subscriber = {
  onData: (chunk: Buffer) => void
  onExit: (exitCode: number) => void
}

const SNAPSHOT_BARRIER_TIMEOUT_MS = 250

type ExitListener = (exitCode: number) => void

/** Handle for one attached client, with its own flow-control debt. */
export type Attachment = {
  acknowledge: (byteCount: number) => void
  dispose: () => void
}

/**
 * One shell. Owns its PTY, a headless xterm holding authoritative screen state
 * for reattach snapshots, flow control, and output batching.
 */
export class Session {
  readonly id: string
  readonly info: TerminalSessionInfo

  private readonly pty: pty.IPty
  private readonly headless: HeadlessTerminal
  private readonly serializer: SerializeAddon
  /**
   * Attached clients and what each still owes. Debt is per client, not per
   * session: with one counter a fast client acknowledges on behalf of a slow
   * one, and the slow one's buffers grow unchecked.
   */
  private readonly subscribers = new Map<Subscriber, { unacked: number }>()
  /**
   * Bookkeeping that wants the exit code but no output. Kept apart from
   * subscribers on purpose: the registry listens for the lifetime of the
   * session, and counting it as a subscriber left `subscribers.size` permanently
   * above zero, so the flow-control reset on last detach could never run.
   */
  private readonly exitListeners = new Set<ExitListener>()

  private pending: Buffer[] = []
  private pendingBytes = 0
  private flushTimer: NodeJS.Timeout | null = null

  private ptyPaused = false
  private disposed = false

  constructor(id: string, request: TerminalOpenRequest, shell: string, env: NodeJS.ProcessEnv, args: string[]) {
    this.id = id

    this.pty = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cwd: request.cwd,
      cols: request.cols,
      rows: request.rows,
      env: env as { [key: string]: string },
    })

    this.headless = new HeadlessTerminal({
      cols: request.cols,
      rows: request.rows,
      scrollback: SNAPSHOT_SCROLLBACK_LINES,
      allowProposedApi: true,
    })
    this.serializer = new SerializeAddon()
    this.headless.loadAddon(this.serializer)

    this.info = {
      id,
      workspaceId: request.workspaceId,
      repoId: request.repoId,
      repoName: request.repoName,
      title: request.title,
      cwd: request.cwd,
      shell,
      cols: request.cols,
      rows: request.rows,
      pid: this.pty.pid,
      exitCode: null,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    }

    this.pty.onData(data => this.handleData(data))
    this.pty.onExit(({ exitCode }) => this.handleExit(exitCode))
  }

  private handleData(data: string): void {
    if (this.disposed) return
    this.info.lastActiveAt = Date.now()

    // Authoritative state for snapshots. Fed the string, as xterm expects.
    this.headless.write(data)

    // One encode, here, at the daemon boundary. Nothing downstream decodes.
    const encoded = Buffer.from(data, 'utf8')

    // Charged only to clients that can acknowledge it. Output nobody is
    // attached to can never be acked, so counting it would pause the pty with
    // no way back: a background build could freeze its own shell forever.
    for (const debt of this.subscribers.values()) debt.unacked += encoded.length
    this.applyBackpressure()
    this.pending.push(encoded)
    this.pendingBytes += encoded.length

    if (this.pendingBytes >= Coalesce.FlushBytes) {
      this.flush()
      return
    }
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), Coalesce.FlushIntervalMs)
    }
  }

  /** Paused while any one client is behind; resumed once all have caught up. */
  private applyBackpressure(): void {
    if (this.info.exitCode !== null) return
    const debts = [...this.subscribers.values()]

    if (!this.ptyPaused) {
      if (debts.some(debt => debt.unacked > FlowControl.HighWatermarkBytes)) {
        this.ptyPaused = true
        this.pty.pause()
      }
      return
    }

    if (debts.every(debt => debt.unacked < FlowControl.LowWatermarkBytes)) {
      this.ptyPaused = false
      this.pty.resume()
    }
  }

  private flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    if (this.pending.length === 0) return

    const chunk = this.pending.length === 1 ? this.pending[0] : Buffer.concat(this.pending, this.pendingBytes)
    this.pending = []
    this.pendingBytes = 0
    for (const subscriber of this.subscribers.keys()) subscriber.onData(chunk)
  }

  private handleExit(exitCode: number): void {
    this.flush()
    this.info.exitCode = exitCode
    this.info.lastActiveAt = Date.now()
    for (const subscriber of this.subscribers.keys()) subscriber.onExit(exitCode)
    for (const listener of this.exitListeners) listener(exitCode)
  }

  subscribe(subscriber: Subscriber): Attachment {
    const debt = { unacked: 0 }
    this.subscribers.set(subscriber, debt)

    return {
      acknowledge: (byteCount: number) => {
        debt.unacked = Math.max(0, debt.unacked - byteCount)
        this.applyBackpressure()
      },
      dispose: () => {
        if (!this.subscribers.delete(subscriber)) return
        // That client's debt leaves with it, and the shell must not stay paused
        // waiting on acks that can no longer come.
        this.applyBackpressure()
      },
    }
  }

  onExit(listener: ExitListener): () => void {
    this.exitListeners.add(listener)
    return () => { this.exitListeners.delete(listener) }
  }

  /**
   * `headless.write` is asynchronous, so serialising straight away can catch the
   * buffer mid-parse and hand a client a snapshot missing the output that
   * prompted the attach. The empty write is a barrier: its callback fires after
   * everything queued before it has been parsed.
   */
  snapshot(): Promise<Buffer> {
    return new Promise(resolve => {
      const serialize = () =>
        Buffer.from(this.serializer.serialize({ scrollback: SNAPSHOT_SCROLLBACK_LINES }), 'utf8')

      // A barrier that never fires would hang the attach, and with it every
      // control request queued behind it.
      const giveUp = setTimeout(() => resolve(serialize()), SNAPSHOT_BARRIER_TIMEOUT_MS)
      this.headless.write('', () => {
        clearTimeout(giveUp)
        resolve(serialize())
      })
    })
  }

  /**
   * Drops scrollback from the authoritative buffer as well as the client's.
   * Clearing only the renderer would bring everything back on the next attach,
   * because the snapshot is rebuilt from this instance.
   */
  clearScrollback(): void {
    this.headless.clear()
  }

  write(data: Buffer): void {
    if (this.disposed || this.info.exitCode !== null) return
    this.pty.write(data.toString('utf8'))
  }

  resize(cols: number, rows: number): void {
    if (this.disposed || this.info.exitCode !== null) return
    if (cols < 1 || rows < 1 || cols > 5000 || rows > 5000) return
    if (cols === this.info.cols && rows === this.info.rows) return
    this.info.cols = cols
    this.info.rows = rows
    this.pty.resize(cols, rows)
    this.headless.resize(cols, rows)
  }

  rename(title: string): void {
    this.info.title = title
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.subscribers.clear()
    this.exitListeners.clear()
    try { this.pty.kill() } catch { /* already gone */ }
    this.headless.dispose()
  }
}
