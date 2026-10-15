// End-to-end test of the Terminals screen's split panes, driven through the
// real app window with real mouse and keyboard input.
//
//   npm run integration:panes            against the production build
//   npm run integration:panes -- --dev   against the Vite dev server, so React
//                                        StrictMode double-mounts every pane
//
// The app runs with a throwaway HOME and daemon home; see tests/helpers/appDriver.js.
// Screenshots of a few states land in tests/integration/screenshots/ for a look.

const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const { ROOT } = require('../helpers/paths')
const { check, summary, wait } = require('../helpers/report')
const { launchApp, daemonSessions, daemonScreen, MODIFIER } = require('../helpers/appDriver')

const DEV = process.argv.includes('--dev')
const DEV_PORT = 5199
const SHOTS = path.join(__dirname, 'screenshots')

const A = 'alpha-service-with-a-long-name'
const W = 'alpha-web'
const J = 'alpha-jobs'
const D = 'alpha-docs'

const tab = name => `__qa.tab(${JSON.stringify(name)})`
const content = name => `__qa.content(${JSON.stringify(name)})`
const layout = panes => panes.map(p => p.tabs.join(',')).join(' | ')
const describe = panes => panes
  .map(p => `[${p.tabs.map(t => (t === p.active ? `${t}*` : t)).join(',')}]${p.focused ? 'F' : ''}${p.chooser ? 'C' : ''}`)
  .join(' ')

async function startDevServer() {
  const vite = spawn(path.join(ROOT, 'node_modules/.bin/vite'), ['--port', String(DEV_PORT), '--strictPort'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
  })
  let out = ''
  vite.stdout.on('data', chunk => { out += chunk })
  vite.stderr.on('data', chunk => { out += chunk })
  for (let i = 0; i < 100 && !out.includes(`localhost:${DEV_PORT}`); i++) await wait(100)
  if (!out.includes(`localhost:${DEV_PORT}`)) throw new Error(`Vite did not start on ${DEV_PORT}:\n${out}`)
  return vite
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true })
  const vite = DEV ? await startDevServer() : null
  const app = await launchApp({ devServerUrl: DEV ? `http://localhost:${DEV_PORT}/` : null })
  const { ev } = app
  let current = []
  const panes = async () => (current = await app.panes())

  async function section(name, body) {
    console.log(`\n## ${name}`)
    try {
      await body()
    } catch (error) {
      check(`${name}: ran to completion`, false, `${error.message} | ${describe(current)}`)
      await app.screenshot(path.join(SHOTS, `failed-${name.replace(/\W+/g, '-').toLowerCase()}.png`)).catch(() => {})
    }
  }

  async function launchRepo(name) {
    const clicked = await ev(`(() => {
      const row = [...document.querySelectorAll('div[title]')]
        .find(d => d.textContent.trim().startsWith(${JSON.stringify(name)}) && d.textContent.includes('Launch'))
      row?.click()
      return !!row
    })()`)
    if (!clicked) throw new Error(`no launcher row for ${name}`)
    await app.waitFor(`!!__qa.tab(${JSON.stringify(name)})`)
    await wait(600)
  }

  async function openWorkspaceTab(name) {
    await app.click(`[...document.querySelectorAll('div[title]')].find(d => d.textContent.startsWith(${JSON.stringify(name)}))`)
    await wait(300)
  }

  try {
    await section('Setup', async () => {
      await app.click(`[...document.querySelectorAll('div')].find(e => e.textContent === 'Terminals' && e.className.includes('cursor-pointer'))`)
      await app.click(`[...document.querySelectorAll('button')].find(b => b.textContent.startsWith('QA Alpha'))`)
      for (const name of [A, W, J, D]) await launchRepo(name)
      const p = await panes()
      check('1 four launched shells share one pane, newest active', layout(p) === [A, W, J, D].join() && p[0].active === D, describe(p))
      check('2 a lone pane has no focus border', !p[0].focused)
      check('3 no drop targets at rest', (await ev('__qa.overlays()')) === 0)
      check('4 the rail lists the tabs in pane order', (await ev('__qa.railTitles()')).join() === [A, W, J, D].join(), (await ev('__qa.railTitles()')).join())
    })

    await section('Dragging the active tab to its own pane edge', async () => {
      const hover = await app.dragAndDrop(tab(D), content(D), 0.96, 0.5)
      check('5 the right edge previews the right half', /right-1/.test(hover.preview) && /w-\[/.test(hover.preview), hover.preview)
      const p = await panes()
      check('6 the tab splits off to the right', layout(p) === `${A},${W},${J} | ${D}`, describe(p))
      check('7 the old pane shows the neighbouring tab', p[0].active === J, describe(p))
      check('8 the new pane has focus', p[1].focused && !p[0].focused, describe(p))
      check('9 the split halves the width', Math.abs(p[0].w - p[1].w) <= 2 && p[0].y === p[1].y, `${p[0].w}/${p[1].w}`)
      check('10 drop targets unmount after the drop', (await ev('__qa.overlays()')) === 0)
    })

    await section('A pane\'s only tab cannot split from itself', async () => {
      const before = describe(await panes())
      const hover = await app.dragAndDrop(tab(D), content(D), 0.04, 0.5)
      check('11 only the other pane is a drop target', hover.overlays === 1, `${hover.overlays} overlays`)
      check('12 its own pane shows no preview', hover.preview === null, hover.preview)
      check('13 nothing moves', describe(await panes()) === before, describe(current))
    })

    await section('A background tab to the top edge', async () => {
      const hover = await app.dragAndDrop(tab(A), content(J), 0.5, 0.04)
      check('14 the top edge previews the top half', /top-1/.test(hover.preview) && /h-\[/.test(hover.preview), hover.preview)
      const p = await panes()
      check('15 the pane splits into top and bottom', layout(p) === `${A} | ${W},${J} | ${D}`, describe(p))
      check('16 stacked panes share a column', p[0].x === p[1].x && p[1].y > p[0].y && Math.abs(p[0].h - p[1].h) <= 2)
      check('17 the moved tab has focus', p[0].focused && p[0].active === A, describe(p))
    })

    await section('Middle drops', async () => {
      const hover = await app.dragAndDrop(tab(W), content(D), 0.5, 0.5)
      check('18 the middle previews the whole pane', /inset-1/.test(hover.preview), hover.preview)
      let p = await panes()
      check('19 the tab joins that pane and becomes active', layout(p) === `${A} | ${J} | ${D},${W}` && p[2].active === W, describe(p))
      const before = layout(p)
      const own = await app.dragAndDrop(tab(D), content(D), 0.5, 0.5)
      p = await panes()
      check('20 the middle of its own pane is no target', own.preview === null && layout(p) === before, describe(p))
    })

    await section('Dragging a pane\'s last tab out', async () => {
      await app.dragAndDrop(tab(A), content(J), 0.5, 0.5)
      const p = await panes()
      check('21 the emptied pane closes', layout(p) === `${J},${A} | ${D},${W}`, describe(p))
      check('22 the panes left take the space back', p.length === 2 && p[0].h === p[1].h && Math.abs(p[0].w - p[1].w) <= 2)
    })

    await section('Tab bar drops', async () => {
      await app.dragAndDrop(tab(W), tab(D), 0.15, 0.5)
      let p = await panes()
      check('23 the left half of a tab inserts before it', p[1].tabs.join() === `${W},${D}`, describe(p))
      await app.dragAndDrop(tab(W), tab(D), 0.85, 0.5)
      p = await panes()
      check('24 the right half inserts after it', p[1].tabs.join() === `${D},${W}`, describe(p))
      await app.dragAndDrop(tab(A), tab(D), 0.85, 0.5)
      p = await panes()
      check('25 a tab dropped on another pane\'s tab moves there, active', layout(p) === `${J} | ${D},${A},${W}` && p[1].active === A, describe(p))
      await app.dragAndDrop(tab(W), `__qa.bar(${JSON.stringify(J)})`, 0.9, 0.5)
      p = await panes()
      check('26 empty tab bar space appends', layout(p) === `${J},${W} | ${D},${A}`, describe(p))
    })

    await section('Sashes', async () => {
      const vertical = `document.querySelector('main [role=separator][aria-orientation=vertical]')`
      const before = await panes()
      await app.pointerDrag(vertical, -120, 0)
      let p = await panes()
      check('27 the sash resizes both sides', p[0].w < before[0].w - 80 && p[1].w > before[1].w + 80, `${before[0].w}/${before[1].w} -> ${p[0].w}/${p[1].w}`)
      await app.click(vertical, 2)
      p = await panes()
      check('28 a double click evens it out', Math.abs(p[0].w - p[1].w) <= 2, `${p[0].w}/${p[1].w}`)
      await app.pointerDrag(vertical, -2000, 0)
      p = await panes()
      check('29 a pane keeps a tenth of the split at least', p[0].w >= (p[0].w + p[1].w) * 0.1 - 2, `${p[0].w}/${p[1].w}`)
      await app.click(vertical, 2)

      await app.dragAndDrop(tab(W), content(D), 0.5, 0.97)
      p = await panes()
      check('30 the bottom edge stacks a new pane underneath', layout(p) === `${J} | ${D},${A} | ${W}` && p[2].y > p[1].y, describe(p))
      const stacked = p
      await app.pointerDrag(`document.querySelector('main [role=separator][aria-orientation=horizontal]')`, 0, 100)
      p = await panes()
      check('31 the horizontal sash resizes the stack', p[1].h > stacked[1].h + 60 && p[2].h < stacked[2].h - 60, `${stacked[1].h}/${stacked[2].h} -> ${p[1].h}/${p[2].h}`)
      check('32 the pane beside it is untouched', p[0].w === stacked[0].w && p[0].h === stacked[0].h)
      await app.screenshot(path.join(SHOTS, 'three-panes.png'))
    })

    await section('Keystrokes reach the focused shell', async () => {
      const typed = [J, A, W]
      for (const name of typed) {
        await app.click(tab(name))
        await app.click(content(name))
        await app.type(`echo QA_TYPED_${typed.indexOf(name)}\r`)
        await wait(600)
      }
      for (const [index, name] of typed.entries()) {
        // The snapshot breaks a wrapped row with CRLF, so long commands split.
        const screen = (await daemonScreen(app.socket, name)).replace(/\r\n/g, '')
        const own = (screen.match(new RegExp(`QA_TYPED_${index}`, 'g')) ?? []).length
        const foreign = typed.some((_, other) => other !== index && screen.includes(`QA_TYPED_${other}`))
        check(`33.${index} ${name} got its own command and no other`, own === 2 && !foreign, `own x${own} ${own === 2 ? '' : JSON.stringify(screen)}`)
      }
    })

    await section('Closing a pane', async () => {
      const before = (await daemonSessions(app.socket)).length
      await app.click(`__qa.pane(${JSON.stringify(W)}).querySelector('button[title^="Close this pane"]')`)
      const p = await panes()
      check('34 its tabs join the first pane', layout(p) === `${J},${W} | ${D},${A}`, describe(p))
      check('35 no shell is killed', (await daemonSessions(app.socket)).length === before)
    })

    await section('Alt+Up and Alt+Down', async () => {
      await app.click(tab(J))
      await app.click(content(J))
      await app.key('ArrowDown', MODIFIER.ALT)
      let p = await panes()
      check('36 next tab, same pane only', p[0].active === W && p[1].active === A, describe(p))
      await app.key('ArrowDown', MODIFIER.ALT)
      p = await panes()
      check('37 it wraps within the pane', p[0].active === J, describe(p))
      await app.key('ArrowUp', MODIFIER.ALT)
      p = await panes()
      check('38 previous wraps backwards', p[0].active === W, describe(p))
    })

    await section('Cmd+\\ and the chooser', async () => {
      await app.key('\\', MODIFIER.META)
      let p = await panes()
      check('39 with panes split, it merges them into one', p.length === 1 && p[0].tabs.length === 4, describe(p))
      await app.key('\\', MODIFIER.META)
      p = await panes()
      check('40 from one pane, it opens an empty one beside it', p.length === 2 && p[1].chooser, describe(p))
      const offered = await ev(`[...__qa.paneEls()[1].querySelectorAll('button .font-mono')].map(e => e.textContent)`)
      check('41 the chooser offers the tabs not showing', offered.length === 3 && !offered.includes(p[0].active), offered.join())
      await app.click(`[...__qa.paneEls()[1].querySelectorAll('button')].find(b => b.textContent.includes(${JSON.stringify(offered[0])}))`)
      p = await panes()
      check('42 picking one moves it into the new pane', p[1].tabs.join() === offered[0] && !p[0].tabs.includes(offered[0]), describe(p))
      await app.key('\\', MODIFIER.META)
      await app.key('\\', MODIFIER.META)
      await app.click(`__qa.paneEls()[1].querySelector('button[title="Cancel the split"]')`)
      p = await panes()
      check('43 cancelling the chooser leaves one pane', p.length === 1 && p[0].tabs.length === 4, describe(p))
      await app.key('\\', MODIFIER.META)
      await app.dragAndDrop(tab(A), '__qa.contentAt(1)', 0.5, 0.5)
      p = await panes()
      check('44 a tab dropped on the chooser fills it', p.length === 2 && p[1].tabs.join() === A, describe(p))
    })

    await section('New and closed tabs inside a pane', async () => {
      const before = (await daemonSessions(app.socket)).length
      await app.click(content(A))
      await app.click(`__qa.pane(${JSON.stringify(A)}).querySelector('button[title^="New tab in this pane"]')`)
      await app.waitFor(`!!__qa.tab(${JSON.stringify(`${A} 2`)})`)
      let p = await panes()
      check('45 + opens the new shell in that pane, active', p[1].tabs.join() === `${A},${A} 2` && p[1].active === `${A} 2`, describe(p))
      check('46 the daemon holds one more shell', (await daemonSessions(app.socket)).length === before + 1)
      await app.click(`${tab(`${A} 2`)}.querySelector('button[title="Close tab"]')`)
      await wait(500)
      p = await panes()
      check('47 closing the active tab activates its neighbour', p[1].tabs.join() === A && p[1].active === A, describe(p))
      check('48 the shell is gone from the daemon', (await daemonSessions(app.socket)).length === before)
    })

    await section('Launching from the drawer into a waiting pane', async () => {
      await app.key('\\', MODIFIER.META)
      await app.key('\\', MODIFIER.META)
      let p = await panes()
      check('49 a chooser is waiting', p.length === 2 && p[1].chooser, describe(p))
      // A repo with a shell already offers another one from its drawer row.
      await app.click(`[...[...document.querySelectorAll('aside')].at(-1).querySelectorAll('.font-mono')].find(e => e.textContent === ${JSON.stringify(J)}).closest('.flex-col').querySelector('button')`)
      await app.waitFor(`!!__qa.tab(${JSON.stringify(`${J} 2`)})`)
      p = await panes()
      check('50 the launched shell lands in the waiting pane', p.length === 2 && p[1].tabs.join() === `${J} 2` && p[1].focused, describe(p))
      await app.click(`${tab(`${J} 2`)}.querySelector('button[title="Close tab"]')`)
      await wait(500)
      p = await panes()
      check('51 closing a pane\'s last tab closes the pane', p.length === 1, describe(p))
    })

    await section('A cancelled drag', async () => {
      await app.dragAndDrop(tab(D), content(D), 0.96, 0.5)
      // Pressing on a tab focuses its pane, as in VS Code, so only focus may change.
      const unfocused = p => describe(p).replace(/F/g, '')
      const before = unfocused(await panes())
      const hover = await app.dragAndDrop(tab(W), content(W), 0.04, 0.5, { cancel: true })
      check('52 the preview showed while hovering', /left-1/.test(hover.preview), hover.preview)
      check('53 drop targets unmount', (await ev('__qa.overlays()')) === 0)
      check('54 nothing moves', unfocused(await panes()) === before, describe(current))
      await app.click(content(W))
      check('55 the terminal takes clicks again', (await panes()).find(p => p.tabs.includes(W)).focused, describe(current))
    })

    await section('The rail', async () => {
      const p = await panes()
      check('56 the rail follows pane order', (await ev('__qa.railTitles()')).join() === p.flatMap(x => x.tabs).join(), (await ev('__qa.railTitles()')).join())
      const target = p[0].tabs.find(t => t !== p[0].active)
      await app.click(`__qa.railCard(${JSON.stringify(target)})`)
      const after = await panes()
      check('57 a rail card shows its tab in the pane that holds it', after[0].active === target && after[0].focused, describe(after))
    })

    await section('Workspaces keep their own layout', async () => {
      const alpha = describe(await panes())
      await app.click(`document.querySelector('button[title="Open another workspace"]')`)
      await app.click(`[...document.querySelectorAll('button')].find(b => b.textContent.startsWith('QA Beta'))`)
      await launchRepo('beta-api')
      let p = await panes()
      check('58 another workspace has panes of its own', layout(p) === 'beta-api', describe(p))
      await openWorkspaceTab('QA Alpha')
      p = await panes()
      check('59 switching back restores panes, tabs and the focused tab', describe(p) === alpha, `${describe(p)} vs ${alpha}`)
      await openWorkspaceTab('QA Beta')
      check('60 and the other is as it was left', layout(await panes()) === 'beta-api', describe(current))
      await openWorkspaceTab('QA Alpha')
    })

    await section('Reload', async () => {
      const before = describe(await panes())
      await ev('location.reload()').catch(() => {})
      await wait(1500)
      await app.waitFor('document.querySelector("#root")?.childElementCount > 0', 20000)
      await app.install()
      await app.click(`[...document.querySelectorAll('div')].find(e => e.textContent === 'Terminals' && e.className.includes('cursor-pointer'))`)
      await app.waitFor('__qa.panes().length > 0', 10000)
      check('61 panes, tab order and focus survive a reload', describe(await panes()) === before, `${describe(current)} vs ${before}`)
    })

    await section('Maximize and the rail', async () => {
      const before = await panes()
      await app.click(`__qa.paneEls()[0].querySelector('button[title="Maximize terminal"]')`)
      let p = await panes()
      check('62 maximize widens every pane', p.every((x, i) => x.w > before[i].w), p.map(x => x.w).join('/'))
      await app.key('Escape')
      p = await panes()
      check('63 Esc restores', p.every((x, i) => Math.abs(x.w - before[i].w) <= 2), p.map(x => x.w).join('/'))
      await app.key('1', MODIFIER.META)
      p = await panes()
      check('64 hiding the rail keeps the split ratio', p[0].w > before[0].w && Math.abs(p[0].w - p[1].w) <= 2, p.map(x => x.w).join('/'))
      await app.key('1', MODIFIER.META)
    })

    await section('Screens after all the moves', async () => {
      for (const name of [A, W, J, D]) {
        const screen = (await daemonScreen(app.socket, name)).replace(/\r\n/g, '')
        const prompts = (screen.match(/qa:/g) ?? []).length
        const commands = (screen.match(/echo QA_TYPED_/g) ?? []).length
        check(`65 ${name}: one prompt per command, plus the current one`, prompts === commands + 1, `${prompts} prompts, ${commands} commands ${prompts === commands + 1 ? '' : JSON.stringify(screen)}`)
      }
      await app.screenshot(path.join(SHOTS, 'after-moves.png'))
    })

    await section('Renaming from the rail', async () => {
      await ev(`__qa.railCard(${JSON.stringify(W)}).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 300 }))`)
      await wait(200)
      await app.click(`document.querySelector('[role=menuitem]')`)
      const setInput = value => ev(`(() => {
        const input = document.querySelector('aside input')
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)})
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })()`)
      await setInput(D)
      await app.key('Enter')
      check('66 a duplicate name is refused in place', /already used/.test(await ev(`document.querySelector('aside [role=alert]')?.textContent ?? ''`)))
      await setInput('alpha-web-renamed')
      await app.key('Enter')
      check('67 the new name shows on the tab', (await panes()).some(p => p.tabs.includes('alpha-web-renamed')), describe(current))
    })

    await section('Closing the workspace', async () => {
      await app.click(`[...document.querySelectorAll('div[title]')].find(d => d.textContent.startsWith('QA Alpha')).querySelector('button')`)
      await app.click(`[...document.querySelectorAll('div')].find(b => b.childElementCount === 0 && b.textContent.startsWith('Close and kill'))`)
      await wait(1500)
      const titles = (await daemonSessions(app.socket)).map(s => s.title)
      check('68 its shells are gone', !titles.some(t => t.startsWith('alpha')), titles.join())
      check('69 its panes are gone', (await panes()).every(p => !p.tabs.some(t => t.startsWith('alpha'))), describe(current))
    })

    check('70 the renderer threw nothing', app.exceptions().length === 0, app.exceptions().join(' || ').slice(0, 500))
  } finally {
    await app.close()
    vite?.kill()
  }
  return summary()
}

main().then(code => process.exit(code), error => {
  console.error(error)
  process.exit(1)
})
