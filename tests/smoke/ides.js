// Smoke test for the IDEs feature's main-process modules.
//
//   npm run smoke:ides
//
// The pure parts (title parsing, `--status` parsing, process classification,
// folder lookup) run against fixtures captured from VS Code 1.107 on macOS.
// When VS Code is running on this machine, a live snapshot is captured too.
// That live path lists windows through the CLI: the test's Electron binary is
// never granted Accessibility, so the AppleScript route cannot run here and
// has to be exercised in the app. See docs/ides-implementation.md.

const { app } = require('electron')
const fs = require('fs')
const path = require('path')

const { ROOT } = require('../helpers/paths')
const { check, summary } = require('../helpers/report')

const FIXTURES = path.join(ROOT, 'tests/fixtures/ides')
const dist = name => require(path.join(ROOT, 'dist/main/ides', `${name}.js`))

function titleChecks() {
  const { parseWindowTitle, folderCandidates } = dist('titles')
  const { VSCODE_APP_NAMES } = dist('vscodeCli')
  const parse = title => parseWindowTitle(title, VSCODE_APP_NAMES)

  let parsed = parse('Location service public … — alphaform-customer-fe — Code')
  check('title: editor, root and app name split', parsed.segments.join('|') === 'Location service public …|alphaform-customer-fe' && parsed.appName === 'Code')
  check('title: root name is the first candidate', folderCandidates(parsed)[0] === 'alphaform-customer-fe')

  parsed = parse('● index.ts — devrealm — Code')
  check('title: dirty marker read and stripped', parsed.dirty && parsed.segments[0] === 'index.ts')

  parsed = parse('Playwright e2e testing s… — cross-platform-e2e-tests')
  check('title: missing app suffix keeps both segments', parsed.appName === null && parsed.segments.length === 2)

  parsed = parse('cloud-iac — Code')
  check('title: bare root name', parsed.segments.length === 1 && parsed.segments[0] === 'cloud-iac')

  parsed = parse('main.ts - devrealm - Visual Studio Code')
  check('title: hyphen separator and long app name', parsed.segments.join('|') === 'main.ts|devrealm' && parsed.appName === 'Visual Studio Code')

  parsed = parse('Visual Studio Code')
  check('title: app name alone leaves no candidates', parsed.segments.length === 0)
}

function folderChecks() {
  const { buildKnownFolderIndex, lookupFolder, parseIdeStateEntries } = dist('knownFolders')
  const workspaces = [{ id: 'w1', name: 'Alphaform', rootPath: '/Users/dev/Workspace/alphaform-workspace', createdAt: 0 }]
  const repos = [
    { id: 'r1', workspaceId: 'w1', name: 'devrealm', path: '/Users/dev/Workspace/Side Projects/devrealm', lastOpenedAt: 0, size: 0 },
    { id: 'r2', workspaceId: 'w1', name: 'backend', path: 'alphaform-backend', lastOpenedAt: 0, size: 0 },
    { id: 'r3', workspaceId: 'w1', name: 'api (old)', path: '/Users/dev/archive/api', lastOpenedAt: 0, size: 0 },
    { id: 'r4', workspaceId: 'w1', name: 'api', path: '/Users/dev/Workspace/api', lastOpenedAt: 0, size: 0 },
    { id: 'r5', workspaceId: 'w1', name: 'web (old)', path: '/Users/dev/archive/web', lastOpenedAt: 0, size: 0 },
    { id: 'r6', workspaceId: 'w1', name: 'web', path: '/Users/dev/Workspace/web', lastOpenedAt: 0, size: 0 },
  ]
  const index = buildKnownFolderIndex(repos, workspaces, [
    { openPath: '/Users/dev/Workspace/alphaform-workspace/cloud-iac', rootName: 'cloud-iac' },
    { openPath: '/Users/dev/Workspace/api', rootName: 'api' },
    { openPath: '/Users/dev/Workspace/platform/everything.code-workspace', rootName: 'everything' },
  ])

  check('folders: unknown root name resolves to nothing', lookupFolder(index, ['alphaform-customer-fe', 'Location service public …']) === null)
  let hit = lookupFolder(index, ['devrealm', 'index.ts'])
  check('folders: absolute repo path found by basename', hit && hit.folder.repoId === 'r1' && hit.folder.workspaceId === 'w1')
  hit = lookupFolder(index, ['alphaform-backend'])
  check('folders: relative repo path resolved against the workspace root', hit && hit.folder.path === '/Users/dev/Workspace/alphaform-workspace/alphaform-backend')
  hit = lookupFolder(index, ['cloud-iac'])
  check('folders: VS Code state folder found without a repo', hit && hit.folder.repoId === null && hit.folder.path.endsWith('/cloud-iac'))
  hit = lookupFolder(index, ['DevRealm'])
  check('folders: basename match ignores case', hit && hit.folder.repoId === 'r1')
  hit = lookupFolder(index, ['index.ts', 'devrealm'])
  check('folders: the right-most candidate is tried first', hit && hit.rootName === 'devrealm')
  hit = lookupFolder(index, ['api'])
  check('folders: a basename clash is settled by what VS Code says it has open', hit && !hit.ambiguous && hit.folder.repoId === 'r4' && hit.folder.seenByIde)
  hit = lookupFolder(index, ['web'])
  check('folders: an unsettled clash is reported, not guessed', hit && hit.ambiguous && hit.folder === null && hit.rootName === 'web')
  hit = lookupFolder(index, ['everything'])
  check('folders: a .code-workspace resolves to its directory and opens by file', hit && hit.folder.path === '/Users/dev/Workspace/platform' && hit.folder.openPath.endsWith('everything.code-workspace'))

  const entries = parseIdeStateEntries({
    windowsState: {
      lastActiveWindow: { folder: 'file:///Users/dev%40host/Side%20Projects/devrealm' },
      openedWindows: [
        { folder: 'file:///Users/dev%40host/Side%20Projects/devrealm' },
        { folder: 'vscode-remote://ssh/elsewhere' },
        { workspace: { configPath: 'file:///Users/dev/team.code-workspace' } },
      ],
    },
  })
  check('storage: file URIs decoded once each, remote entries skipped', entries.length === 2 && entries[0].openPath === '/Users/dev@host/Side Projects/devrealm')
  check('storage: workspace files kept under their display name', entries[1].rootName === 'team' && entries[1].openPath === '/Users/dev/team.code-workspace')
  check('storage: garbage is an empty list', parseIdeStateEntries(null).length === 0 && parseIdeStateEntries({}).length === 0)
}

function statusChecks() {
  const { parseStatusWindowTitles, bundleFromExecutable } = dist('vscodeCli')
  const output = fs.readFileSync(path.join(FIXTURES, 'code-status.txt'), 'utf8')
  const titles = parseStatusWindowTitles(output)
  check('status: five windows parsed from Workspace Stats', titles.length === 5, titles.join(' | '))
  check('status: a title without the app suffix is kept', titles.includes('Playwright e2e testing s… — cross-platform-e2e-tests'))
  check('status: Folder lines are not windows', titles.every(title => !title.startsWith('Folder')))

  const { assertOpenablePath } = dist('vscodeCli')
  const rejects = value => { try { assertOpenablePath(value); return false } catch { return true } }
  check('cli: relative, flag-like and missing paths are refused', rejects('relative/dir') && rejects('--status') && rejects('/definitely/not/here') && rejects(42))
  check('cli: an existing folder is accepted', !rejects(ROOT))
  check('cli: a plain file is refused unless it is a .code-workspace', rejects(path.join(ROOT, 'package.json')))

  const bundle = bundleFromExecutable('/private/var/folders/xx/T/AppTranslocation/0000/d/Visual Studio Code.app/Contents/MacOS/Electron')
  check('cli: bundle path recovered from a translocated executable', bundle === '/private/var/folders/xx/T/AppTranslocation/0000/d/Visual Studio Code.app')
  check('cli: no bundle in an unrelated command', bundleFromExecutable('/usr/bin/ps axww') === null)
}

function processChecks() {
  if (process.platform !== 'darwin') {
    console.log('skip process classification fixture: captured on macOS')
    return
  }
  const { parsePsOutput, findIdeProcessTree, VSCODE_PROCESS_MATCHER } = dist('processes')
  const rows = parsePsOutput(fs.readFileSync(path.join(FIXTURES, 'ps-darwin.txt'), 'utf8'))
  check('ps: every fixture row parsed', rows.length === 12, `${rows.length} rows`)

  const tree = findIdeProcessTree(rows, VSCODE_PROCESS_MATCHER)
  check('ps: main process found and the CLI invocation is not it', tree.main && tree.main.pid === 92503)
  const group = kind => tree.usage.groups.find(item => item.kind === kind)
  check('ps: a child with a recycled lower pid is still counted', group('renderer') && group('renderer').count === 3)
  check('ps: extension host told apart from other utilities', group('extension-host') && group('extension-host').count === 1 && group('utility').count === 1)
  check('ps: grandchildren land under child', group('child') && group('child').count === 2)
  check('ps: gpu classified', group('gpu') && group('gpu').count === 1)
  check('ps: unrelated processes excluded', tree.usage.processCount === 9, `${tree.usage.processCount} processes`)
  const expectedBytes = (144160 + 35792 + 102144 + 20080 + 284672 + 3000 + 48592 + 42672 + 23728) * 1024
  check('ps: memory is the RSS sum in bytes', tree.usage.memoryBytes === expectedBytes)
  check('ps: cpu summed to one decimal', tree.usage.cpuPercent === 14.5, String(tree.usage.cpuPercent))
  check('ps: no tree when nothing matches', findIdeProcessTree(rows.slice(0, 1), VSCODE_PROCESS_MATCHER).main === null)

  const { parseWin32ProcessJson } = dist('processes')
  const winRows = parseWin32ProcessJson(JSON.stringify([
    { ProcessId: 10, ParentProcessId: 1, WorkingSetSize: 2048, CommandLine: '"C:\\Users\\dev\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe"', Name: 'Code.exe' },
    { ProcessId: 11, ParentProcessId: 10, WorkingSetSize: 1024, CommandLine: null, Name: 'Code.exe' },
  ]))
  check('win32: process JSON parsed with null CPU and bytes to KB', winRows.length === 2 && winRows[0].cpu === null && winRows[0].rssKb === 2 && winRows[1].command === 'Code.exe')
  const single = parseWin32ProcessJson(JSON.stringify({ ProcessId: 5, ParentProcessId: 1, WorkingSetSize: 0, CommandLine: 'x' }))
  check('win32: a single object is one row', single.length === 1)
  const nullCpu = findIdeProcessTree([{ pid: 1, ppid: 0, cpu: null, rssKb: 1, command: 'unrelated' }, { pid: 2, ppid: 0, cpu: null, rssKb: 3, command: '/x/Visual Studio Code.app/Contents/MacOS/Electron' }], VSCODE_PROCESS_MATCHER)
  const renamed = findIdeProcessTree([
    { pid: 3, ppid: 1, cpu: 1, rssKb: 1, command: '/Applications/Visual Studio Code.app/Contents/MacOS/Code /Applications/Visual Studio Code.app/Contents/Resources/app/out/cli.js --status' },
    { pid: 4, ppid: 1, cpu: 1, rssKb: 1, command: '/Applications/Visual Studio Code.app/Contents/MacOS/Code' },
  ], VSCODE_PROCESS_MATCHER)
  check('ps: the main process is found under its 1.141 name, Code', renamed.main && renamed.main.pid === 4)
  check('ps: cpu total is null when no row has a sample', nullCpu.usage && nullCpu.usage.cpuPercent === null && nullCpu.usage.memoryBytes === 3 * 1024)
}

async function liveChecks() {
  const { captureIdeSnapshot } = dist('snapshot')
  const snapshot = await captureIdeSnapshot()
  console.log(`live: installed=${snapshot.installed} running=${snapshot.running} source=${snapshot.source} windows=${snapshot.windows.length} took ${snapshot.durationMs}ms`)
  for (const warning of snapshot.warnings) console.log(`live: warning: ${warning}`)
  check('live: snapshot has the shape the renderer expects', Array.isArray(snapshot.windows) && typeof snapshot.capturedAt === 'number')
  const { execFileSync } = require('child_process')
  const visible = process.platform === 'darwin' &&
    execFileSync('ps', ['-axo', 'command'], { encoding: 'utf8' }).split('\n').some(line => /Visual Studio Code\.app\/Contents\/MacOS\//.test(line))
  if (visible) check('live: a VS Code that ps can see is reported as running', snapshot.running)
  if (!snapshot.running) {
    console.log('skip live window checks: VS Code is not running')
    return
  }
  check('live: process totals present while running', snapshot.usage && snapshot.usage.processCount > 0)
  check('live: windows listed through some source', snapshot.source !== 'none', snapshot.warnings.join('; '))
  if (snapshot.source !== 'none') {
    check('live: window ids unique', new Set(snapshot.windows.map(win => win.id)).size === snapshot.windows.length)
    check('live: dedupe keeps folder ids stable', snapshot.windows.every(win => win.id.startsWith(win.folderPath ? 'folder:' : 'title:')))
    check('live: every window is numbered among its title twins', snapshot.windows.every(win => Number.isInteger(win.titleIndex) && win.titleIndex >= 1))
    for (const win of snapshot.windows) console.log(`live: ${win.folderPath ?? '(no folder)'}  <-  ${win.title}`)
  }
  const again = await captureIdeSnapshot()
  check('live: a second capture reuses the status cache', again.source !== 'cli' || again.durationMs < snapshot.durationMs, `${again.durationMs}ms`)
  const fresh = await captureIdeSnapshot({ fresh: true })
  check('live: a fresh capture skips the cache', fresh.source !== 'cli' || fresh.durationMs > again.durationMs, `${fresh.durationMs}ms`)
}

app.whenReady().then(async () => {
  try {
    titleChecks()
    folderChecks()
    statusChecks()
    processChecks()
    await liveChecks()
  } catch (error) {
    check(`threw: ${error instanceof Error ? error.stack : String(error)}`, false)
  }
  app.exit(summary())
})
