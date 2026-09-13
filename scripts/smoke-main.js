// Exercises the real main-process DaemonClient: spawn, connect, handshake, control.
//
//   npm run smoke:main
//
// Complements smoke-daemon.js, which drives the daemon directly. This one
// catches wiring bugs on the Electron side, such as a wrong daemon entry path.

const { app } = require('electron')
const path = require('path')
const ROOT = path.resolve(__dirname, "..")

app.whenReady().then(async () => {
  const { daemonClient } = require(path.join(ROOT, 'dist/main/terminals/daemonClient.js'))
  try {
    await daemonClient.ensureConnected()
    console.log('ok   main process spawned and reached the daemon')
    const before = await daemonClient.listSessions()
    console.log('ok   list works |', before.length, 'existing session(s)')
    const info = await daemonClient.control({
      op: 'open',
      params: { workspaceId: 'ws', repoId: 'r', repoName: 'mainpath', title: 'mainpath', cwd: ROOT, cols: 80, rows: 24 },
    })
    console.log('ok   open works | pid', info.pid, 'shell', info.shell)
    await daemonClient.control({ op: 'close', params: { id: info.id } })
    console.log('ok   close works')
    app.exit(0)
  } catch (error) {
    console.error('FAIL', error)
    app.exit(1)
  }
})
