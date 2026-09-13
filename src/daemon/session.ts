import * as pty from 'node-pty'
import { Terminal as HeadlessTerminal } from '@xterm/headless'
import { SerializeAddon } from '@xterm/addon-serialize'
import type { TerminalOpenRequest, TerminalSessionInfo } from '../shared/terminal'
import { SNAPSHOT_SCROLLBACK_LINES } from '../shared/terminal'
import { Coalesce, FlowControl } from '../shared/terminalProtocol'

type Subscriber = {
  onData: (chunk: Buffer) => void
  onExit: (exitCode: number) => void
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
  private readonly subscribers = new Set<Subscriber>()

  private pending: Buffer[] = []
  private pendingBytes = 0
  private flushTimer: NodeJS.Timeout | null = null

  /** Chars written to clients that have not been acknowledged yet. */
  private unacknowledgedChars = 0
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

    // Flow control is measured in chars, matching VS Code's watermarks.
    this.unacknowledgedChars += data.length
    if (!this.ptyPaused && this.unacknowledgedChars > FlowControl.HighWatermarkChars) {
      this.ptyPaused = true
      this.pty.pause()
    }

    // One encode, here, at the daemon boundary. Nothing downstream decodes.
    const encoded = Buffer.from(data, 'utf8')
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

  private flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    if (this.pending.length === 0) return

    const chunk = this.pending.length === 1 ? this.pending[0] : Buffer.concat(this.pending, this.pendingBytes)
    this.pending = []
    this.pendingBytes = 0
    for (const subscriber of this.subscribers) subscriber.onData(chunk)
  }

  private handleExit(exitCode: number): void {
    this.flush()
    this.info.exitCode = exitCode
    this.info.lastActiveAt = Date.now()
    for (const subscriber of this.subscribers) subscriber.onExit(exitCode)
  }

  subscribe(subscriber: Subscriber): () => void {
    this.subscribers.add(subscriber)
    return () => { this.subscribers.delete(subscriber) }
  }

  /**
   * Current screen plus scrollback as an escape-sequence string, so a client
   * that attaches late gets correct terminal state rather than a byte window
   * that may start mid-sequence.
   */
  snapshot(): Buffer {
    return Buffer.from(this.serializer.serialize({ scrollback: SNAPSHOT_SCROLLBACK_LINES }), 'utf8')
  }

  write(data: Buffer): void {
    if (this.disposed || this.info.exitCode !== null) return
    this.pty.write(data.toString('utf8'))
  }

  /**
   * Client has rendered `charCount` chars. Resume the pty once it has caught
   * up past the low watermark.
   */
  acknowledge(charCount: number): void {
    this.unacknowledgedChars = Math.max(0, this.unacknowledgedChars - charCount)
    if (this.ptyPaused && this.unacknowledgedChars < FlowControl.LowWatermarkChars) {
      this.ptyPaused = false
      this.pty.resume()
    }
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
    try { this.pty.kill() } catch { /* already gone */ }
    this.headless.dispose()
  }
}
