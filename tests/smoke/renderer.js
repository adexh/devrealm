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

const { ROOT, PRELOAD } = require('../helpers/paths')
const { useTemporaryDaemonHome } = require('../helpers/daemonHome')
const { check, summary } = require('../helpers/report')

const { cleanup: cleanupHome } = useTemporaryDaemonHome('smoke-renderer')

const CSS = fs.readdirSync(path.join(ROOT, 'dist/renderer/assets'))
  .filter(name => name.startsWith('index-') && name.endsWith('.css'))
  .map(name => path.join(ROOT, 'dist/renderer/assets', name))[0]

const PAGE = `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="file://${CSS}">
<body><script>
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

  port.postMessage({ t: 'resize', cols: 111, rows: 37 })
  port.postMessage({ t: 'ack', chars: 10 })
  await wait(500)
  const resized = (await api.list()).find(s => s.id === info.id)
  log(resized && resized.cols === 111 && resized.rows === 37,
      '6 resize reaches the pty', resized ? resized.cols + 'x' + resized.rows : 'missing')

  // StrictMode remounts attach twice for one pane. The loser must resolve null
  // instead of throwing, and must not detach the winner's attachment.
  const raced = await Promise.all([
    api.attach({ id: info.id, cols: 80, rows: 24 }),
    api.attach({ id: info.id, cols: 80, rows: 24 }),
  ])
  log(raced.filter(Boolean).length === 1, '7 a superseded attach resolves null, not an error',
      raced.map(r => (r ? 'ref ' + r.ref : 'null')).join(', '))

  const winnerPort = await new Promise(resolve => {
    const seen = []
    const onPort = event => {
      if (event.source !== window) return
      if (!event.data || event.data.type !== 'devrealm:terminal-port') return
      seen.push(event.ports[0])
      resolve(seen[seen.length - 1])
    }
    window.addEventListener('message', onPort)
    setTimeout(() => resolve(null), 1500)
  })
  let afterRace = ''
  if (winnerPort) {
    winnerPort.onmessage = e => { if (e.data.t === 'data') afterRace += dec.decode(e.data.b) }
    winnerPort.start()
    await wait(300)
    winnerPort.postMessage({ t: 'input', b: new TextEncoder().encode('echo RACE_WINNER_OK\\r') })
    await wait(1800)
  }
  log(afterRace.includes('RACE_WINNER_OK'), '8 the surviving attach still carries input and output')

  await api.close(info.id)
  log(true, '9 close from the renderer')

  const pending = new Map()
  window.addEventListener('message', event => {
    if (event.source !== window) return
    if (!event.data || event.data.type !== 'devrealm:terminal-port') return
    pending.set(event.data.sessionId, event.ports[0])
  })

  const panes = []
  for (const name of ['pane-left', 'pane-right']) {
    const session = await api.open({
      workspaceId: 'ws', repoId: 'r', repoName: name, title: name,
      cwd: ${JSON.stringify(ROOT)}, cols: 80, rows: 24,
    })
    await api.attach({ id: session.id, cols: 80, rows: 24 })
    for (let i = 0; i < 40 && !pending.has(session.id); i++) await wait(50)
    const pane = { id: session.id, name, port: pending.get(session.id), text: '', snapshot: false }
    if (pane.port) {
      pane.port.onmessage = e => {
        if (e.data.t === 'snapshot') pane.snapshot = true
        else if (e.data.t === 'data') pane.text += dec.decode(e.data.b)
      }
      pane.port.start()
    }
    panes.push(pane)
  }
  log(panes.every(pane => pane.port), '10 both split panes receive a port')

  await wait(1200)
  log(panes.every(pane => pane.snapshot), '11 both split panes get a snapshot',
      panes.map(pane => pane.name + ':' + pane.snapshot).join(' '))

  for (const pane of panes) {
    pane.port.postMessage({ t: 'input', b: new TextEncoder().encode('echo OK_' + pane.name + '\\r') })
  }
  await wait(2000)
  log(panes.every(pane => pane.text.includes('OK_' + pane.name)),
      '12 both split panes stay usable after the second attach',
      panes.map(pane => pane.name + ':' + pane.text.includes('OK_' + pane.name)).join(' '))

  for (const pane of panes) await api.close(pane.id)

  // The app puts its dark class on a div, not <html>, so the terminal theme
  // must be resolved from an element inside that subtree.
  const themed = document.createElement('div')
  themed.className = 'dark'
  const inner = document.createElement('div')
  themed.appendChild(inner)
  document.body.appendChild(themed)
  const plain = document.createElement('div')
  document.body.appendChild(plain)

  const read = el => getComputedStyle(el).getPropertyValue('--tm-0').trim()
  const darkBg = read(inner)
  const lightBg = read(plain)
  const rootBg = read(document.documentElement)
  log(darkBg && lightBg && darkBg !== lightBg,
      '13 terminal background follows the theme', 'dark ' + darkBg + ', light ' + lightBg)
  log(rootBg === lightBg,
      '14 documentElement would have returned the light palette', 'root ' + rootBg)

  window.__done = true
}
run().catch(e => { console.log('FAIL threw | ' + e.message); window.__done = true })
</script></body>`


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
  // Assertions run in page context, so they arrive as console lines and are
  // replayed into the shared reporter here.
  win.webContents.on('console-message', (...args) => {
    const message = typeof args[1] === 'string' ? args[1] : args[0]?.message
    if (!message) return
    const match = /^(ok|FAIL)\s+(.*)$/.exec(message)
    if (match) check(match[2], match[1] === 'ok')
    else console.log(message)
  })

  await win.loadFile(pagePath)

  let finished = false
  for (let i = 0; i < 200; i++) {
    finished = await win.webContents.executeJavaScript('window.__done === true').catch(() => false)
    if (finished) break
    await new Promise(r => setTimeout(r, 100))
  }
  check('page finished within the timeout', finished)

  fs.rmSync(pagePath, { force: true })
  cleanupHome()
  app.exit(summary())
})
