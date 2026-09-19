// Exercises the real main-process DaemonClient: spawn, connect, handshake,
// control, and the replacement of a daemon running stale code.
//
//   npm run smoke:main
//
// Complements tests/smoke/daemon.js, which drives the daemon directly. This one
// catches wiring bugs on the Electron side, such as a wrong daemon entry path.

const { app } = require('electron')
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const { ROOT, DAEMON_ENTRY } = require('../helpers/paths')
const { useTemporaryDaemonHome } = require('../helpers/daemonHome')
const { check, summary, wait } = require('../helpers/report')

const { DAEMON_SOCKET_NAME, TERMINAL_DATA_DIR } = require(path.join(ROOT, 'dist/shared/terminal.js'))

// A daemon home of its own. Pointed at the real one, this run would drive the
// daemon the developer is using, and a build-id mismatch would then kill the
// shells they are working in.
const { home: HOME, cleanup: cleanupHome } = useTemporaryDaemonHome('smoke-main')
process.env.DEVREALM_DAEMON_PIPE = `\\\\.\\pipe\\devrealm-smoke-${process.pid}`

const SOCKET = process.platform === 'win32'
  ? process.env.DEVREALM_DAEMON_PIPE
  : path.join(HOME, DAEMON_SOCKET_NAME)


/**
 * A daemon claiming a build id that cannot match the bundle on disk, standing
 * in for one left running across a rebuild.
 */
function spawnStaleDaemon() {
  const child = spawn(process.execPath, [
    DAEMON_ENTRY,
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
    check('main process spawned and reached the daemon', true)

    await wait(300)
    check('a daemon running stale code is replaced', staleExited)

    const before = await daemonClient.listSessions()
    check('list works', Array.isArray(before), `${before.length} existing session(s)`)
    const info = await daemonClient.control({
      op: 'open',
      params: { workspaceId: 'ws', repoId: 'r', repoName: 'mainpath', title: 'mainpath', cwd: ROOT, cols: 80, rows: 24 },
    })
    check('open works', Boolean(info.id), `pid ${info.pid}, shell ${info.shell}`)
    check('the replacement daemon serves sessions', Boolean(info.pid))
    await daemonClient.control({ op: 'close', params: { id: info.id } })
    check('close works', true)

    // shutdown is answered by going away, so there is no reply to await.
    daemonClient.control({ op: 'shutdown' }).catch(() => {})
    await wait(300)
    cleanupHome()
    app.exit(summary())
  } catch (error) {
    console.error('FAIL', error)
    cleanupHome()
    app.exit(summary())
  }
})
