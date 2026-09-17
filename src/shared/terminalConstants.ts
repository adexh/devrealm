/**
 * Protocol values shared by the daemon, the main process and the renderer.
 *
 * Deliberately free of `Buffer` and every other Node type, so the renderer can
 * import it. The framing itself lives in `terminalProtocol.ts`, which is
 * Node-only and excluded from the renderer's compilation.
 */

export const PROTOCOL_VERSION = 1
export const SUPPORTED_PROTOCOL_VERSIONS = [1]

export const HEADER_SIZE = 8
/** Refuse absurd frames rather than allocating on a corrupt length. */
export const MAX_FRAME_PAYLOAD = 16 * 1024 * 1024

export const FrameType = {
  Hello: 0x01,
  HelloAck: 0x02,
  ControlRequest: 0x10,
  ControlResponse: 0x11,
  ControlEvent: 0x12,
  Data: 0x20,
  Input: 0x21,
  Resize: 0x22,
  Ack: 0x23,
  Snapshot: 0x24,
  Exit: 0x25,
  Ping: 0x30,
  Pong: 0x31,
} as const

export type FrameTypeValue = (typeof FrameType)[keyof typeof FrameType]

/**
 * Flow control, with VS Code's FlowControlConstants values. Do not tune blind.
 *
 * Counted in bytes rather than VS Code's chars, because the two ends of this
 * protocol see different things: the daemon holds a JS string and the renderer
 * holds a Uint8Array. Bytes are the only unit both can agree on exactly.
 */
export const FlowControl = {
  /** Unacknowledged bytes before the pty is paused. */
  HighWatermarkBytes: 100000,
  /** Unacknowledged bytes the client must catch up to before the pty resumes. */
  LowWatermarkBytes: 5000,
  /** Bytes the client accumulates before sending an ack. */
  ByteCountAckSize: 5000,
} as const

/** Daemon-side output batching. Our addition, not VS Code's; measure before trusting. */
export const Coalesce = {
  /** Roughly one frame per 30fps tick, matching the reference implementation. */
  FlushIntervalMs: 32,
  /** Flush early once this much output has accumulated. */
  FlushBytes: 64 * 1024,
} as const
