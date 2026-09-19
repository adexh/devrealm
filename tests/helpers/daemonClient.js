// A minimal client for the daemon's wire protocol, for tests that drive it
// directly rather than through the Electron main process.

const net = require('net')
const { ROOT } = require('./paths')
const path = require('path')

const {
  FrameDecoder, FrameType, encodeAck, encodeFrame, encodeJsonFrame, PROTOCOL_VERSION,
} = require(path.join(ROOT, 'dist/shared/node/terminalProtocol.js'))

let requestId = 0

/**
 * Connects to a daemon socket and returns a small API over it.
 *
 * Data frames are acknowledged automatically, the way the renderer does. A
 * client that never acks makes the daemon pause the pty exactly as designed,
 * and the test then measures its own missing acks rather than the daemon.
 */
function connect(socketPath) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath)
    const decoder = new FrameDecoder()
    const waiters = new Map()
    const dataListeners = []
    let snapshotListener = null

    socket.once('error', reject)
    socket.on('data', chunk => {
      for (const frame of decoder.push(chunk)) {
        if (frame.type === FrameType.HelloAck) {
          waiters.get('hello')?.(JSON.parse(frame.payload.toString()))
        } else if (frame.type === FrameType.ControlResponse) {
          const body = JSON.parse(frame.payload.toString())
          waiters.get(body.requestId)?.(body)
        } else if (frame.type === FrameType.Data) {
          socket.write(encodeAck(frame.ref, frame.payload.length))
          dataListeners.forEach(listener => listener(frame.payload.toString()))
        } else if (frame.type === FrameType.Snapshot) {
          snapshotListener?.(frame.payload.toString())
        }
      }
    })

    socket.once('connect', () => resolve({
      socket,
      hello: () => new Promise(done => {
        waiters.set('hello', done)
        socket.write(encodeJsonFrame(FrameType.Hello, 0, { protocolVersion: PROTOCOL_VERSION }))
      }),
      control: (op, params) => new Promise(done => {
        const id = ++requestId
        waiters.set(id, done)
        socket.write(encodeJsonFrame(FrameType.ControlRequest, 0, { op, params, requestId: id }))
      }),
      input: (ref, text) => socket.write(encodeFrame(FrameType.Input, ref, Buffer.from(text))),
      onData: listener => dataListeners.push(listener),
      onSnapshot: listener => { snapshotListener = listener },
      close: () => socket.destroy(),
    }))
  })
}

module.exports = { connect }
