// Checks the terminal pane groups, the pure model behind drag-and-drop
// splits and per-pane tab bars on the Terminals screen.
//
//   npm run smoke:panes
//
// Plain Node. The module has no imports, so transpiling it alone is enough.

const fs = require('fs')
const path = require('path')
const Module = require('module')
const ts = require('typescript')
const { ROOT } = require('../helpers/paths')
const { check, summary } = require('../helpers/report')

const source = path.join(ROOT, 'src/renderer/stores/terminalLayout.ts')
const { outputText } = ts.transpileModule(fs.readFileSync(source, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
})
const compiled = new Module(source)
compiled._compile(outputText, source)
const layout = compiled.exports

const {
  paneGroup, paneGroups, allSessionIds, groupOf, removeSession, dropOnGroup, dropOnTab, closeGroup,
  mergeGroups, reconcileLayout, splitGroup, placePanes, dropZone, orderByIds, activateSession,
} = layout
const tabs = node => JSON.stringify(paneGroups(node).map(group => group.sessionIds))
const idOf = (node, sessionId) => groupOf(node, sessionId).id

const one = paneGroup(['a', 'b', 'c'])
let tree = dropOnGroup(one, 'c', one.id, 'right')
check('a tab dropped on its own pane edge splits it off', tabs(tree) === '[["a","b"],["c"]]' && tree.direction === 'row')
check('the sole tab of a pane cannot split from itself', dropOnGroup(tree, 'c', idOf(tree, 'c'), 'left') === tree)
check('dropping on its own pane middle does nothing', dropOnGroup(tree, 'a', idOf(tree, 'a'), 'center') === tree)

tree = dropOnGroup(tree, 'b', idOf(tree, 'c'), 'bottom')
check('splits nest', tabs(tree) === '[["a"],["c"],["b"]]' && tree.second.direction === 'column')

const placed = placePanes(tree)
const rectOf = id => placed.panes.find(pane => pane.group.sessionIds.includes(id)).rect
check('a split halves its target', rectOf('a').w === 0.5 && rectOf('c').h === 0.5 && rectOf('b').y === 0.5)
check('one sash per split', placed.sashes.length === 2)

const moved = dropOnGroup(tree, 'a', idOf(tree, 'c'), 'center')
check('a middle drop moves the tab into that pane', tabs(moved) === '[["c","a"],["b"]]')
check('the emptied pane closes', moved.kind === 'split' && moved.direction === 'column')
check('the moved tab is active in its new pane', groupOf(moved, 'a').activeId === 'a')

check('a tab dropped before another lands there', tabs(dropOnTab(moved, 'b', idOf(moved, 'c'), 'c', false)) === '[["b","c","a"]]')
check('a tab dropped after another lands there', tabs(dropOnTab(moved, 'c', idOf(moved, 'a'), 'a', true)) === '[["a","c"],["b"]]')
check('a tab dropped on a bar with no target goes last', tabs(dropOnTab(moved, 'b', idOf(moved, 'c'), null, true)) === '[["c","a","b"]]')
check('the sole tab dropped on its own bar does nothing', dropOnTab(moved, 'b', idOf(moved, 'b'), null, true) === moved)

check('closing a pane moves its tabs to the first pane', tabs(closeGroup(moved, idOf(moved, 'b'))) === '[["c","a","b"]]')
check('merging puts every tab in one pane', tabs(mergeGroups(moved, 'b')) === '[["c","a","b"]]' && mergeGroups(moved, 'b').activeId === 'b')

const closed = removeSession(paneGroup(['a', 'b', 'c'], 'b'), 'b')
check('closing the active tab activates its neighbour', closed.activeId === 'c')
check('the last tab of the only pane leaves it empty', allSessionIds(removeSession(paneGroup(['a']), 'a')).length === 0)

const waiting = splitGroup(paneGroup(['a']), paneGroups(paneGroup(['a']))[0].id, null, 'right')
const chooser = splitGroup(one, one.id, null, 'right')
check('an empty split waits for a tab', tabs(chooser) === '[["a","b","c"],[]]')
check('a waiting split takes a dropped tab', tabs(dropOnGroup(chooser, 'b', paneGroups(chooser)[1].id, 'center')) === '[["a","c"],["b"]]')

check('dead shells leave the layout', tabs(reconcileLayout(moved, ['a', 'b'], null)) === '[["a"],["b"]]')
check('new shells join the preferred pane', tabs(reconcileLayout(moved, ['a', 'b', 'c', 'd'], 'b')) === '[["c","a"],["b","d"]]')
check('no shells, no layout', reconcileLayout(moved, [], null) === null)
check('an empty split alone is no layout', tabs(reconcileLayout(waiting, ['x'], null)) === '[["x"]]')
check('activating the active tab changes nothing', activateSession(moved, 'a') === moved)

check('middle is a move', dropZone(50, 50, 100, 100) === 'center')
check('outer tenth splits sideways in the side thirds', dropZone(5, 50, 100, 100) === 'left' && dropZone(95, 50, 100, 100) === 'right')
check('outer tenth splits up or down in the middle third', dropZone(50, 5, 100, 100) === 'top' && dropZone(50, 95, 100, 100) === 'bottom')
check('sessions follow layout order, unknown ones last', orderByIds(['a', 'b', 'c', 'd'].map(id => ({ id })), ['c', 'a']).map(s => s.id).join() === 'c,a,b,d')

process.exit(summary())
