// Exercises the renderer half of the terminal data plane.
//
//   npm run smoke:renderer
//
// Loads a real BrowserWindow with the real preload, opens a session, attaches,
// and drives the MessagePort from page context. This is the path that broke
// when the port was passed through contextBridge and arrived as an inert clone.

const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

const ROOT = path.resolve(__dirname, '..')
const PRELOAD = path.join(ROOT, 'dist/main/preload.js')

const PAGE = `<!doctype html><meta charset="utf-8"><body><script>
const log = (ok, label, extra) => console.log((ok ? 'ok   ' : 'FAIL ') + label + (extra ? ' | ' + extra : ''))
const wait = ms => new Promise(r => setTimeout(r, ms))

async function run() {
  const api = window.electronAPI.terminals
  const info = await api.open({
    workspaceId: 'ws', repoId: 'r', repoName: 'renderer-smoke', title: 'renderer-smoke',
    cwd: ${JSON.stringify(ROOT)}, cols: 80, rows: 24,
  })
  log(!!info.id, '1 open from the renderer', 'pid ' + info.pid)

  let port = null
  const portArrived = new Promise(resolve => {
    window.addEventListener('message', event => {
      if (event.source !== window) return
      if (!event.data || event.data.type !== 'devrealm:terminal-port') return
      port = event.ports[0]
      resolve()
    })
  })

  await api.attach({ id: info.id, cols: 80, rows: 24 })
  await Promise.race([portArrived, wait(4000)])
  log(!!port, '2 port reaches the page')
  log(port && typeof port.start === 'function' && typeof port.postMessage === 'function'
        && typeof port.close === 'function', '3 port is a live MessagePort, not a clone')
  if (!port) { window.__done = true; return }

  let sawSnapshot = false
  let text = ''
  const dec = new TextDecoder()
  port.onmessage = e => {
    if (e.data.t === 'snapshot') sawSnapshot = true
    else if (e.data.t === 'data') text += dec.decode(e.data.b)
  }
  port.start()
  await wait(1200)
  log(sawSnapshot, '4 snapshot frame delivered on attach')

  port.postMessage({ t: 'input', b: new TextEncoder().encode('echo RENDERER_PATH_OK\\r') })
  await wait(1800)
  log(text.includes('RENDERER_PATH_OK'), '5 typing reaches the shell and output returns')

  port.postMessage({ t: 'resize', cols: 100, rows: 30 })
  port.postMessage({ t: 'ack', chars: 10 })
  await wait(300)
  log(true, '6 resize and ack accepted without throwing')

  await api.close(info.id)
  log(true, '7 close from the renderer')
  window.__done = true
}
run().catch(e => { console.log('FAIL threw | ' + e.message); window.__done = true })
</script></body>`

let failures = 0

app.whenReady().then(async () => {
  const { registerTerminalIpcHandlers } = require(path.join(ROOT, 'dist/main/terminals/ipc.js'))
  let win
  registerTerminalIpcHandlers(() => (win ? win.webContents : null))

  const pagePath = path.join(os.tmpdir(), `devrealm-renderer-smoke-${process.pid}.html`)
  fs.writeFileSync(pagePath, PAGE)

  win = new BrowserWindow({
    show: false,
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false },
  })
  win.webContents.on('console-message', (...args) => {
    const message = typeof args[1] === 'string' ? args[1] : args[0]?.message
    if (!message) return
    if (message.startsWith('FAIL')) failures++
    console.log(message)
  })

  await win.loadFile(pagePath)

  for (let i = 0; i < 200; i++) {
    const done = await win.webContents.executeJavaScript('window.__done === true').catch(() => false)
    if (done) break
    await new Promise(r => setTimeout(r, 100))
  }

  fs.rmSync(pagePath, { force: true })
  console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
  app.exit(failures === 0 ? 0 : 1)
})
