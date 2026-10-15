/**
 * Wire protocol between the Electron main process and the PTY daemon.
 *
 * One AF_UNIX socket (named pipe on Windows) carries every frame. Control
 * operations ride a JSON frame type; PTY bytes ride a binary one, so JSON
 * never appears on the data path.
 *
 * Frame layout, 8-byte header then payload:
 *
 *   0        1        2        4                8
 *   +--------+--------+--------+----------------+------------------+
 *   | type   | rsvd   | ref u16 LE | length u32 LE |  payload       |
 *   +--------+--------+--------+----------------+------------------+
 *
 * `ref` is a u16 handle assigned at attach time, so session ids never appear
 * on the hot path: a 36-byte uuid alongside a 1-byte keystroke is pure waste.
 *
 * Node-only: excluded from the renderer's tsconfig. Values the renderer also
 * needs live in `terminalConstants.ts`.
 */
import { FrameType, HEADER_SIZE, MAX_FRAME_PAYLOAD } from '../terminalConstants'

export * from '../terminalConstants'

export type Frame = {
  type: number
  ref: number
  payload: Buffer
}

export function encodeFrame(type: number, ref: number, payload: Buffer): Buffer {
  const header = Buffer.allocUnsafe(HEADER_SIZE)
  header.writeUInt8(type, 0)
  header.writeUInt8(0, 1)
  header.writeUInt16LE(ref, 2)
  header.writeUInt32LE(payload.length, 4)
  return payload.length === 0 ? header : Buffer.concat([header, payload], HEADER_SIZE + payload.length)
}

export function encodeJsonFrame(type: number, ref: number, value: unknown): Buffer {
  return encodeFrame(type, ref, Buffer.from(JSON.stringify(value), 'utf8'))
}

export function encodeResize(ref: number, cols: number, rows: number): Buffer {
  const payload = Buffer.allocUnsafe(4)
  payload.writeUInt16LE(cols, 0)
  payload.writeUInt16LE(rows, 2)
  return encodeFrame(FrameType.Resize, ref, payload)
}

export function decodeResize(payload: Buffer): { cols: number; rows: number } {
  return { cols: payload.readUInt16LE(0), rows: payload.readUInt16LE(2) }
}

export function encodeAck(ref: number, charCount: number): Buffer {
  const payload = Buffer.allocUnsafe(4)
  payload.writeUInt32LE(charCount, 0)
  return encodeFrame(FrameType.Ack, ref, payload)
}

export function encodeExit(ref: number, exitCode: number): Buffer {
  const payload = Buffer.allocUnsafe(4)
  payload.writeInt32LE(exitCode, 0)
  return encodeFrame(FrameType.Exit, ref, payload)
}

/**
 * Reassembles frames from a stream that splits and joins chunks arbitrarily.
 * Holds one growing buffer and slices complete frames off the front.
 */
export class FrameDecoder {
  private buffered: Buffer = Buffer.alloc(0)

  push(chunk: Buffer): Frame[] {
    this.buffered = this.buffered.length === 0 ? chunk : Buffer.concat([this.buffered, chunk])
    const frames: Frame[] = []

    while (this.buffered.length >= HEADER_SIZE) {
      const length = this.buffered.readUInt32LE(4)
      if (length > MAX_FRAME_PAYLOAD) throw new Error(`Frame payload too large: ${length}`)
      const total = HEADER_SIZE + length
      if (this.buffered.length < total) break

      frames.push({
        type: this.buffered.readUInt8(0),
        ref: this.buffered.readUInt16LE(2),
        payload: this.buffered.subarray(HEADER_SIZE, total),
      })
      this.buffered = this.buffered.subarray(total)
    }

    return frames
  }
}
