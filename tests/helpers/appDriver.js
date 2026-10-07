// Drives the real app: a built DevRealm window under Electron, steered over the
// Chrome DevTools Protocol with real mouse and keyboard input.
//
// Everything it touches is throwaway. HOME points at a temporary directory
// seeded with its own workspaces, so ~/.workspace-manager is never read or
// written, and DEVREALM_DAEMON_HOME gives it a daemon of its own, so the
// developer's shells are never replaced or killed.

const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { ROOT, ELECTRON } = require('./paths')
const { connect: connectDaemon } = require('./daemonClient')
const { wait } = require('./report')

/**
 * One repo name is long on purpose: the prompt shows the folder, so it wraps
 * in a half-width pane, which is where resize and reattach bugs show up.
 */
const WORKSPACES = {
  'qa-alpha': { name: 'QA Alpha', repos: ['alpha-service-with-a-long-name', 'alpha-web', 'alpha-jobs', 'alpha-docs'] },
  'qa-beta': { name: 'QA Beta', repos: ['beta-api', 'beta-ui'] },
}

function seedHome(home) {
  const now = Date.now()
  const workspaces = []
  const repos = []
  for (const [id, spec] of Object.entries(WORKSPACES)) {
    const rootPath = path.join(home, 'code', id)
    workspaces.push({ id, name: spec.name, rootPath, createdAt: now })
    for (const name of spec.repos) {
      const repoPath = path.join(rootPath, name)
      fs.mkdirSync(repoPath, { recursive: true })
      repos.push({ id: `${id}-${name}`, workspaceId: id, name, path: repoPath, lastOpenedAt: now, size: 0 })
    }
  }
  fs.mkdirSync(path.join(home, '.workspace-manager'), { recursive: true })
  fs.writeFileSync(path.join(home, '.workspace-manager', 'workspaces.json'), JSON.stringify({ schemaVersion: 2, workspaces, repos }))
  // A fixed prompt, whatever the developer's own one looks like.
  const prompt = "PROMPT='qa:%1~ %# '\n"
  fs.writeFileSync(path.join(home, '.zshrc'), prompt)
  fs.writeFileSync(path.join(home, '.bashrc'), "PS1='qa:\\W \\$ '\n")
  fs.writeFileSync(path.join(home, '.bash_profile'), '. ~/.bashrc\n')
}

const PROBES = `window.__qa = {
  paneEls: () => [...document.querySelectorAll('main div.absolute.flex-col.border-t-2')],
  tabEls: scope => [...(scope ?? document).querySelectorAll('[draggable=true]')],
  tabName: t => t.textContent.replace('>_', '').trim(),
  panes() {
    return this.paneEls().map(p => {
      const r = p.getBoundingClientRect()
      const tabs = this.tabEls(p)
      return {
        tabs: tabs.map(t => this.tabName(t)),
        active: tabs.filter(t => t.className.includes('bg-tm-0 ')).map(t => this.tabName(t))[0] ?? null,
        focused: p.className.includes('border-tm-ok'),
        chooser: !!p.querySelector('button[title="Cancel the split"]'),
        x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height),
      }
    })
  },
  tab(name) { return this.tabEls().find(t => this.tabName(t) === name) },
  pane(name) { return this.paneEls().find(p => this.tabEls(p).some(t => this.tabName(t) === name)) },
  content(name) { return this.pane(name)?.querySelector(':scope > div.relative') },
  contentAt(i) { return this.paneEls()[i]?.querySelector(':scope > div.relative') },
  bar(name) { return this.pane(name)?.querySelector('.\\\\@container > div') },
  overlays: () => document.querySelectorAll('div.z-20.inset-0').length,
  preview() {
    const p = document.querySelector('.bg-tm-ok\\\\/20')
    return p ? p.className.split(' ').filter(c => /^(inset|left|right|top|bottom|w-|h-)/.test(c)).join(' ') : null
  },
  railTitles: () => [...(document.querySelector('aside')?.querySelectorAll('.flex.flex-col.gap-1 .font-mono.truncate') ?? [])].map(e => e.textContent),
  railCard(title) { return [...(document.querySelector('aside')?.querySelectorAll('.flex.flex-col.gap-1') ?? [])].find(c => c.querySelector('.font-mono.truncate')?.textContent === title) },
}; 'ok'`

async function launchApp({ devServerUrl = null } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'devrealm-qa-'))
  // A Unix socket path is capped near 104 bytes, and macOS temp paths are long.
  const daemonHome = fs.mkdtempSync('/tmp/drqa-')
  const home = path.join(base, 'home')
  const userData = path.join(base, 'user-data')
  seedHome(home)

  const env = { ...process.env, HOME: home, DEVREALM_DAEMON_HOME: daemonHome }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.NODE_ENV
  const app = spawn(ELECTRON, [path.join(ROOT, 'dist/main/main.js'), `--user-data-dir=${userData}`, '--remote-debugging-port=0'], {
    env, stdio: ['ignore', 'ignore', 'pipe'],
  })
  let appLog = ''
  app.stderr.on('data', chunk => { appLog += chunk })

  const portFile = path.join(userData, 'DevToolsActivePort')
  for (let i = 0; i < 200 && !fs.existsSync(portFile); i++) await wait(50)
  if (!fs.existsSync(portFile)) throw new Error(`the app never opened a debugging port\n${appLog.slice(-2000)}`)
  const port = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0])

  let target = null
  for (let i = 0; i < 100 && !target; i++) {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json().catch(() => [])
    target = targets.find(t => t.type === 'page' && !t.url.startsWith('devtools'))
    if (!target) await wait(100)
  }
  if (!target) throw new Error('the app window never appeared')

  const driver = await connectPage(target.webSocketDebuggerUrl)
  Object.assign(driver, { home, daemonHome, socket: path.join(daemonHome, 'term.sock'), appLog: () => appLog })

  if (devServerUrl) {
    // Vite optimises dependencies on its first page load and then reloads the
    // page, which would land mid-test. Loading once beforehand absorbs that.
    for (let load = 0; load < 2; load++) {
      await driver.send('Page.navigate', { url: devServerUrl })
      await driver.waitFor('document.querySelector("#root")?.childElementCount > 0', 30000)
      await wait(2000)
    }
  }
  await driver.waitFor('document.querySelector("#root")?.childElementCount > 0', 20000)
  await driver.install()

  driver.close = async () => {
    try { driver.ws.close() } catch { /* already closed */ }
    app.kill()
    try {
      const daemon = await connectDaemon(driver.socket)
      await daemon.hello()
      await daemon.control('shutdown', {})
      daemon.close()
    } catch { /* never started, or already gone */ }
    await wait(300)
    fs.rmSync(base, { recursive: true, force: true })
    fs.rmSync(daemonHome, { recursive: true, force: true })
  }
  return driver
}

async function connectPage(url) {
  const ws = new WebSocket(url)
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject) })
  const events = []
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data)
    if (m.method) events.push(m)
  })
  let nextId = 0

  const d = {
    ws,
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++nextId
        const timer = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), 15000)
        const on = e => {
          const m = JSON.parse(e.data)
          if (m.id !== id) return
          clearTimeout(timer)
          ws.removeEventListener('message', on)
          if (m.error) reject(new Error(`${method}: ${m.error.message}`))
          else resolve(m.result)
        }
        ws.addEventListener('message', on)
        ws.send(JSON.stringify({ id, method, params }))
      })
    },
    async ev(expression) {
      const r = await d.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      if (r.exceptionDetails) throw new Error(`in page: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`)
      return r.result.value
    },
    async waitFor(expression, timeout = 5000) {
      const until = Date.now() + timeout
      while (Date.now() < until) {
        if (await d.ev(expression).catch(() => false)) return true
        await wait(100)
      }
      throw new Error(`timed out waiting for ${expression}`)
    },
    async install() {
      await d.ev(PROBES)
    },
    exceptions() {
      return events.filter(e => e.method === 'Runtime.exceptionThrown')
        .map(e => e.params.exceptionDetails.exception?.description ?? e.params.exceptionDetails.text)
    },
    panes: () => d.ev('__qa.panes()'),

    async rect(expr) {
      return d.ev(`(() => {
        const el = ${expr}
        if (!el) return null
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        const r = el.getBoundingClientRect()
        return [r.left, r.top, r.width, r.height]
      })()`)
    },
    async mouse(type, x, y, extra = {}) {
      await d.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', ...extra })
    },
    async click(expr, clickCount = 1) {
      const r = await d.rect(expr)
      if (!r) throw new Error(`nothing to click: ${expr}`)
      const x = r[0] + r[2] / 2, y = r[1] + r[3] / 2
      await d.mouse('mouseMoved', x, y)
      for (let count = 1; count <= clickCount; count++) {
        await d.mouse('mousePressed', x, y, { buttons: 1, clickCount: count })
        await d.mouse('mouseReleased', x, y, { clickCount: count })
      }
      await wait(400)
    },
    async pointerDrag(expr, dx, dy) {
      const r = await d.rect(expr)
      if (!r) throw new Error(`nothing to drag: ${expr}`)
      const x = r[0] + r[2] / 2, y = r[1] + r[3] / 2
      await d.mouse('mousePressed', x, y, { buttons: 1, clickCount: 1 })
      for (let i = 1; i <= 6; i++) {
        await d.mouse('mouseMoved', x + dx * i / 6, y + dy * i / 6, { buttons: 1 })
        await wait(50)
      }
      await d.mouse('mouseReleased', x + dx, y + dy, { clickCount: 1 })
      await wait(400)
    },
    /**
     * An HTML drag and drop started by a real press and move on `srcExpr`.
     * Chromium hands the drag over instead of starting an OS drag session, and
     * it is dropped at fractions (fx, fy) of `dstExpr` with real drag events.
     * Returns what the page showed while hovering, before the drop.
     */
    async dragAndDrop(srcExpr, dstExpr, fx, fy, { cancel = false } = {}) {
      await d.send('Input.setInterceptDrags', { enabled: true })
      try {
        const src = await d.rect(srcExpr)
        if (!src) throw new Error(`no drag source: ${srcExpr}`)
        const sx = src[0] + src[2] / 2, sy = src[1] + src[3] / 2
        const seen = events.length
        await d.mouse('mouseMoved', sx, sy)
        await d.mouse('mousePressed', sx, sy, { buttons: 1, clickCount: 1 })
        for (let i = 1; i <= 8; i++) {
          await d.mouse('mouseMoved', sx + i * 5, sy + i * 3, { buttons: 1 })
          await wait(15)
        }
        let intercepted = null
        for (let i = 0; i < 20 && !intercepted; i++) {
          intercepted = events.slice(seen).find(e => e.method === 'Input.dragIntercepted')
          if (!intercepted) await wait(25)
        }
        if (!intercepted) {
          await d.mouse('mouseReleased', sx, sy, { clickCount: 1 })
          throw new Error(`drag did not start from ${srcExpr}`)
        }
        const data = intercepted.params.data
        // The drop targets mount a tick after dragstart.
        await wait(100)
        const dst = await d.rect(dstExpr)
        if (!dst) throw new Error(`no drop target: ${dstExpr}`)
        const x = dst[0] + dst[2] * fx, y = dst[1] + dst[3] * fy
        await d.send('Input.dispatchDragEvent', { type: 'dragEnter', x, y, data })
        for (let i = 0; i < 3; i++) {
          await d.send('Input.dispatchDragEvent', { type: 'dragOver', x, y, data })
          await wait(40)
        }
        const hover = { preview: await d.ev('__qa.preview()'), overlays: await d.ev('__qa.overlays()') }
        await d.send('Input.dispatchDragEvent', { type: cancel ? 'dragCancel' : 'drop', x, y, data })
        await d.mouse('mouseReleased', x, y, { clickCount: 1 })
        await wait(700)
        return hover
      } finally {
        await d.send('Input.setInterceptDrags', { enabled: false })
      }
    },
    async key(keyName, modifiers = 0) {
      const KEYS = {
        '\\': ['Backslash', 220], ArrowUp: ['ArrowUp', 38], ArrowDown: ['ArrowDown', 40],
        Escape: ['Escape', 27], Enter: ['Enter', 13], 1: ['Digit1', 49],
      }
      const [code, windowsVirtualKeyCode] = KEYS[keyName]
      const base = { modifiers, key: keyName, code, windowsVirtualKeyCode }
      await d.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base })
      await d.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base })
      await wait(500)
    },
    async type(text) {
      await d.send('Input.insertText', { text })
      await wait(100)
    },
    async screenshot(file) {
      const r = await d.send('Page.captureScreenshot', { format: 'png' })
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'))
    },
  }
  return d
}

const MODIFIER = { ALT: 1, META: 4 }

async function daemonSessions(socket) {
  const client = await connectDaemon(socket)
  await client.hello()
  const sessions = (await client.control('list', {})).result
  client.close()
  return sessions
}

/**
 * A shell's authoritative screen. Attaches at the size it already has, so the
 * app's view of it is not resized.
 */
async function daemonScreen(socket, title) {
  const client = await connectDaemon(socket)
  await client.hello()
  const sessions = (await client.control('list', {})).result
  const session = sessions.find(item => item.title === title)
  if (!session) {
    client.close()
    return null
  }
  let snapshot = ''
  client.onSnapshot(text => { snapshot = text })
  await client.control('attach', { id: session.id, cols: session.cols, rows: session.rows })
  await wait(300)
  client.close()
  return snapshot
}

module.exports = { launchApp, daemonSessions, daemonScreen, MODIFIER, WORKSPACES }
