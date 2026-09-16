// Exercises the real main-process DaemonClient: spawn, connect, handshake,
// control, and the replacement of a daemon running stale code.
//
//   npm run smoke:main
//
// Complements smoke-daemon.js, which drives the daemon directly. This one
// catches wiring bugs on the Electron side, such as a wrong daemon entry path.

const { app } = require('electron')
const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const { DAEMON_SOCKET_NAME, TERMINAL_DATA_DIR } = require(path.join(ROOT, 'dist/shared/terminal.js'))

// A daemon home of its own. Pointed at the real one, this run would drive the
// daemon the developer is using, and a build-id mismatch would then kill the
// shells they are working in.
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'devrealm-smoke-main-'))
process.env.DEVREALM_DAEMON_HOME = HOME
process.env.DEVREALM_DAEMON_PIPE = `\\\\.\\pipe\\devrealm-smoke-${process.pid}`

const SOCKET = process.platform === 'win32'
  ? process.env.DEVREALM_DAEMON_PIPE
  : path.join(HOME, DAEMON_SOCKET_NAME)

let failures = 0

function check(label, ok) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`)
  if (!ok) failures++
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

/**
 * A daemon claiming a build id that cannot match the bundle on disk, standing
 * in for one left running across a rebuild.
 */
function spawnStaleDaemon() {
  const child = spawn(process.execPath, [
    path.join(ROOT, 'dist/daemon/main.js'),
    '--build-id=stale',
    `--socket=${SOCKET}`,
    `--data-dir=${path.join(HOME, TERMINAL_DATA_DIR)}`,
  ], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
  return child
}

async function waitForSocket(shouldExist) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (fs.existsSync(SOCKET) === shouldExist) return true
    await wait(25)
  }
  return false
}

app.whenReady().then(async () => {
  const { daemonClient } = require(path.join(ROOT, 'dist/main/terminals/daemonClient.js'))
  try {
    const stale = spawnStaleDaemon()
    let staleExited = false
    stale.on('exit', () => { staleExited = true })
    if (process.platform !== 'win32') await waitForSocket(true)
    else await wait(500)

    await daemonClient.ensureConnected()
    console.log('ok   main process spawned and reached the daemon')

    await wait(300)
    check('a daemon running stale code is replaced', staleExited)

    const before = await daemonClient.listSessions()
    console.log('ok   list works |', before.length, 'existing session(s)')
    const info = await daemonClient.control({
      op: 'open',
      params: { workspaceId: 'ws', repoId: 'r', repoName: 'mainpath', title: 'mainpath', cwd: ROOT, cols: 80, rows: 24 },
    })
    console.log('ok   open works | pid', info.pid, 'shell', info.shell)
    check('the replacement daemon serves sessions', Boolean(info.pid))
    await daemonClient.control({ op: 'close', params: { id: info.id } })
    console.log('ok   close works')

    // shutdown is answered by going away, so there is no reply to await.
    daemonClient.control({ op: 'shutdown' }).catch(() => {})
    await wait(300)
    fs.rmSync(HOME, { recursive: true, force: true })
    app.exit(failures === 0 ? 0 : 1)
  } catch (error) {
    console.error('FAIL', error)
    fs.rmSync(HOME, { recursive: true, force: true })
    app.exit(1)
  }
})
