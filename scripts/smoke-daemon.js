// End-to-end smoke test for the PTY daemon.
//
// Proves the claim the whole design rests on: a shell outlives the client that
// started it, and a fresh client reattaches to correct terminal state.
//
//   npm run smoke:daemon
//
// Runs the real daemon under the real Electron binary in Node mode, so it also
// catches a broken native node-pty build.

const { spawn } = require('child_process')
const net = require('net')
const os = require('os')
const path = require('path')
const fs = require('fs')

const ROOT = path.resolve(__dirname, '..')
const { FrameDecoder, FrameType, encodeFrame, encodeJsonFrame, PROTOCOL_VERSION } = require(path.join(ROOT, 'dist/shared/terminalProtocol.js'))

const SOCK = path.join(os.tmpdir(), `devrealm-smoke-${process.pid}.sock`)
const DATA = path.join(os.tmpdir(), `devrealm-smoke-data-${process.pid}`)
const ELECTRON = process.platform === 'darwin'
  ? path.join(ROOT, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
  : path.join(ROOT, 'node_modules/electron/dist', process.platform === 'win32' ? 'electron.exe' : 'electron')

let requestId = 0
function client() {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(SOCK)
    const decoder = new FrameDecoder()
    const waiters = new Map()
    const onData = []
    let onSnapshot = null
    socket.once('error', reject)
    socket.on('data', chunk => {
      for (const f of decoder.push(chunk)) {
        if (f.type === FrameType.HelloAck) waiters.get('hello')?.(JSON.parse(f.payload.toString()))
        else if (f.type === FrameType.ControlResponse) {
          const b = JSON.parse(f.payload.toString())
          waiters.get(b.requestId)?.(b)
        } else if (f.type === FrameType.Data) onData.forEach(cb => cb(f.payload.toString()))
        else if (f.type === FrameType.Snapshot) onSnapshot?.(f.payload.toString())
      }
    })
    socket.once('connect', async () => {
      const api = {
        socket,
        hello: () => new Promise(r => { waiters.set('hello', r); socket.write(encodeJsonFrame(FrameType.Hello, 0, { protocolVersion: PROTOCOL_VERSION })) }),
        control: (op, params) => new Promise(r => { const id = ++requestId; waiters.set(id, r); socket.write(encodeJsonFrame(FrameType.ControlRequest, 0, { op, params, requestId: id })) }),
        input: (ref, text) => socket.write(encodeFrame(FrameType.Input, ref, Buffer.from(text))),
        onData: cb => onData.push(cb),
        onSnapshot: cb => { onSnapshot = cb },
      }
      resolve(api)
    })
  })
}

const wait = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
function check(label, ok, extra = '') {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${extra ? ' | ' + extra : ''}`)
}

async function main() {
  const daemon = spawn(ELECTRON, [path.join(ROOT, 'dist/daemon/main.js'), `--socket=${SOCK}`, `--data-dir=${DATA}`], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      // Launcher state the daemon must not pass on to user shells.
      CLAUDE_CODE_CHILD_SESSION: 'leaked',
      CLAUDE_CODE_MESSAGING_TOKEN: 'leaked',
      CLAUDECODE: 'leaked',
      VSCODE_IPC_HOOK: 'leaked',
      DEVREALM_SMOKE_KEPT: 'kept',
    },
    detached: true, stdio: ['ignore', 'ignore', 'pipe'],
  })
  daemon.stderr.on('data', d => process.stdout.write(`[daemon] ${d}`))
  daemon.unref()

  for (let i = 0; i < 100 && !fs.existsSync(SOCK); i++) await wait(50)

  // --- client A: open a shell, run a command ---
  const a = await client()
  const ack = await a.hello()
  check('1 handshake and version negotiation', ack.ok === true, `protocol ${ack.protocolVersion}, daemon pid ${ack.pid}`)

  const opened = await a.control('open', {
    workspaceId: 'ws1', repoId: 'r1', repoName: 'smoke', title: 'smoke',
    cwd: ROOT, cols: 80, rows: 24,
  })
  check('2 session opens with a real pty', opened.ok === true && opened.result?.pid > 0, `pid ${opened.result?.pid}, shell ${opened.result?.shell}`)
  const id = opened.result.id

  const attached = await a.control('attach', { id, cols: 80, rows: 24 })
  check('3 attach assigns a ref', attached.result?.ref > 0, `ref ${attached.result?.ref}`)

  let seen = ''
  a.onData(text => { seen += text })
  await wait(1200)
  a.input(attached.result.ref, 'echo SMOKE_MARKER_OK\r')
  await wait(1500)
  check('4 input round-trips through the pty', seen.includes('SMOKE_MARKER_OK'))

  // --- client A goes away entirely, as if the app quit ---
  a.socket.destroy()
  await wait(600)
  check('5 daemon survives its client disconnecting', !daemon.killed)

  // --- client B: a fresh app process reattaches ---
  const b = await client()
  await b.hello()
  const list = await b.control('list')
  check('6 session survives client exit', list.result.length === 1, `title ${list.result[0]?.title}`)

  let snapshot = ''
  b.onSnapshot(text => { snapshot = text })
  const reattached = await b.control('attach', { id, cols: 80, rows: 24 })
  await wait(500)
  check('7 snapshot replays pre-detach output', snapshot.includes('SMOKE_MARKER_OK'), `${snapshot.length} bytes`)

  let seenB = ''
  b.onData(t => { seenB += t })
  b.input(reattached.result.ref, 'echo SECOND_CLIENT_OK\r')
  await wait(1200)
  check('8 the same shell accepts input from the new client', seenB.includes('SECOND_CLIENT_OK'))

  // The daemon runs with launcher state in its own environment; none of it
  // should reach a shell, while ordinary variables still must.
  let envOut = ''
  b.onData(t => { envOut += t })
  b.input(reattached.result.ref,
    'echo "LEAK:[$CLAUDE_CODE_CHILD_SESSION][$CLAUDE_CODE_MESSAGING_TOKEN][$CLAUDECODE][$VSCODE_IPC_HOOK] KEPT:[$DEVREALM_SMOKE_KEPT]"\r')
  await wait(1500)
  check('9 launcher session state is stripped from the shell', envOut.includes('LEAK:[][][][]'))
  check('10 ordinary variables still reach the shell', envOut.includes('KEPT:[kept]'))

  const closed = await b.control('close', { id })
  check('11 close tears the session down', closed.ok === true)
  b.socket.destroy()
  process.kill(daemon.pid, 'SIGTERM')
  fs.rmSync(DATA, { recursive: true, force: true })
  console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(e => { console.error('SMOKE FAILED:', e); process.exit(1) })
