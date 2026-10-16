//   npm run smoke:templates
//
// Plain Node against the built main process; scaffold.js has no Electron imports.

const fs = require('fs')
const os = require('os')
const path = require('path')
const { ROOT } = require('../helpers/paths')
const { check, summary } = require('../helpers/report')

const scaffold = require(path.join(ROOT, 'dist/main/templates/scaffold.js'))
const items = require(path.join(ROOT, 'dist/main/templates/items.js'))

function write(root, relativePath, content) {
  const file = path.join(root, relativePath)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
}

const read = (root, relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'devrealm-templates-'))
const source = path.join(tmp, 'source')
const target = path.join(tmp, 'target')

write(source, 'CLAUDE.md', '# Source rules\n')
write(source, 'CLAUDE.local.md', 'personal\n')
write(source, '.mcp.json', JSON.stringify({ mcpServers: { db: { command: 'pg' } } }))
write(source, '.claude/settings.json', JSON.stringify({ permissions: { allow: ['Bash(npm test)'] }, enabledPlugins: { 'a@m': true, 'b@m': true, 'off@m': false }, mcpServers: { inline: { url: 'https://x' } }, model: 'opus' }))
write(source, '.claude/settings.local.json', JSON.stringify({ env: { TOKEN: 'x' }, enabledPlugins: { 'local@m': true }, mcpServers: { gh: { command: 'gh-mcp', env: { GITHUB_TOKEN: 'ghp_secret' } } } }))
write(source, '.claude/skills/review/SKILL.md', '---\nname: review\ndescription: Reviews diffs\n---\n')
write(source, '.claude/skills/review/checklist.md', '- tests\n')
write(source, '.claude/agents/planner.md', '# planner\n')
write(source, '.claude/hooks/check.sh', '#!/bin/sh\nexit 0\n')
write(source, '.claude/node_modules/x/index.js', 'ignored')
write(source, '.claude/worktrees/feature-x/CLAUDE.md', 'a whole checkout')
write(source, 'src/index.ts', 'not ai config')

const files = scaffold.captureFiles(source)
const paths = files.map(file => file.path)
check('capture: picks up root AI files, .mcp.json and everything under .claude',
  ['.claude/hooks/check.sh', '.claude/settings.json', '.claude/skills/review/SKILL.md', '.mcp.json', 'CLAUDE.md'].every(p => paths.includes(p)), paths.join(','))
check('capture: reads personal files too, so they can be offered', paths.includes('.claude/settings.local.json') && paths.includes('CLAUDE.local.md'))
check('capture: leaves out node_modules, worktrees and project source', !paths.some(p => p.includes('node_modules') || p.includes('worktrees') || p.startsWith('src/')))

const plugins = items.capturePlugins(files, { m: { source: { source: 'github', repo: 'org/market' } } })
check('plugins: enabled ones from both settings files are captured, with their marketplace source',
  JSON.stringify(plugins.map(p => p.id)) === '["a@m","b@m","local@m"]' && plugins.every(p => p.marketplace === 'org/market'), JSON.stringify(plugins))

const described = items.describeConfig({ files, plugins })
const ids = described.map(item => item.id)
check('items: one per plugin, skill, MCP server and file, plus the other settings',
  ['file:CLAUDE.md', 'plugin:a@m', 'plugin:b@m', 'skill:review', 'mcp:db', 'mcp:inline', 'file:.claude/agents/planner.md', 'settings', 'file:.claude/hooks/check.sh'].every(id => ids.includes(id)), ids.join(','))
check('items: a skill folder is a single item with its description', described.filter(item => item.group === 'skills').length === 1 && described.find(item => item.id === 'skill:review').detail === 'Reviews diffs')
check('items: settings lists the keys that are not plugins or MCP', described.find(item => item.id === 'settings').detail === 'permissions, model')
check('items: local settings and CLAUDE.local.md are offered but marked personal',
  described.find(item => item.id === 'settings-local')?.personal === true && described.find(item => item.id === 'file:CLAUDE.local.md')?.personal === true)
check('items: a plugin or MCP server only settings.local.json enables is personal',
  described.find(item => item.id === 'plugin:local@m')?.personal === true && described.find(item => item.id === 'mcp:gh')?.personal === true)
check('items: plugins and MCP servers from shared files are not personal',
  !described.find(item => item.id === 'plugin:a@m').personal && !described.find(item => item.id === 'mcp:db').personal)
const defaults = items.selectContent({ files, plugins }, described.filter(item => !item.personal).map(item => item.id))
const overlap = [
  { path: '.mcp.json', content: JSON.stringify({ mcpServers: { gh: { command: 'gh' } } }) },
  { path: '.claude/settings.local.json', content: JSON.stringify({ mcpServers: { gh: { command: 'gh', env: { GITHUB_TOKEN: 'ghp_local' } } } }) },
]
const overlapItems = items.describeConfig({ files: overlap, plugins: [] })
const overlapPicked = items.selectContent({ files: overlap, plugins: [] }, overlapItems.filter(item => !item.personal).map(item => item.id))
check('select: a shared server also defined in settings.local.json never brings the local token',
  overlapPicked.files.some(file => file.path === '.mcp.json') && !overlapPicked.files.some(file => file.content.includes('ghp_local')))
check('select: the default selection carries nothing from settings.local.json',
  !defaults.files.some(file => file.path === '.claude/settings.local.json' || file.content.includes('ghp_secret')))
const userSettings = items.describeConfig({ files: [{ path: '.claude/settings.json', content: JSON.stringify({ env: { KEY: 'sk' }, mcpServers: { s: { command: 'x' } } }) }], plugins: [] }, true)
check('items: in the home folder, settings.json and its MCP servers are personal',
  userSettings.find(item => item.id === 'settings')?.personal === true && userSettings.find(item => item.id === 'mcp:s')?.personal === true)

const picked = items.selectContent({ files, plugins }, ['plugin:a@m', 'mcp:db', 'skill:review'])
const pickedPaths = picked.files.map(file => file.path)
const pickedSettings = JSON.parse(picked.files.find(file => file.path === '.claude/settings.json').content)
check('select: a skill brings its whole folder', pickedPaths.includes('.claude/skills/review/SKILL.md') && pickedPaths.includes('.claude/skills/review/checklist.md'))
check('select: unselected files stay out', !pickedPaths.includes('CLAUDE.md') && !pickedPaths.includes('.claude/agents/planner.md'))
check('select: unticked personal files stay out', !pickedPaths.includes('.claude/settings.local.json') && !pickedPaths.includes('CLAUDE.local.md'))
const withLocal = items.selectContent({ files, plugins }, ['settings-local'])
check('select: ticking local settings keeps them, minus unticked plugins',
  JSON.parse(withLocal.files.find(file => file.path === '.claude/settings.local.json').content).env.TOKEN === 'x' && withLocal.plugins.length === 0)
check('select: settings keep only the chosen plugins and drop other settings',
  JSON.stringify(pickedSettings) === '{"enabledPlugins":{"a@m":true}}', JSON.stringify(pickedSettings))
check('select: .mcp.json keeps only the chosen servers', JSON.parse(picked.files.find(file => file.path === '.mcp.json').content).mcpServers.db)
check('select: plugins list follows the selection', picked.plugins.length === 1 && picked.plugins[0].id === 'a@m')
const noJson = items.selectContent({ files, plugins }, ['file:CLAUDE.md'])
check('select: JSON files with nothing chosen are left out', noJson.files.map(file => file.path).join() === 'CLAUDE.md')

write(target, 'CLAUDE.md', '# Target rules\n')
write(target, '.claude/settings.json', JSON.stringify({ permissions: { allow: ['Read'] }, model: 'sonnet' }))
write(target, '.claude/skills/review/SKILL.md', '---\nname: review\ndescription: Reviews diffs\n---\n')

const actions = Object.fromEntries(scaffold.planScaffold(files, target, 'merge').map(entry => [entry.path, entry.action]))
check('plan merge: a missing file is created', actions['.claude/hooks/check.sh'] === 'create' && actions['.mcp.json'] === 'create')
check('plan merge: a differing markdown file is skipped', actions['CLAUDE.md'] === 'skip')
check('plan merge: a differing JSON file is merged', actions['.claude/settings.json'] === 'merge')
check('plan merge: an identical file is unchanged', actions['.claude/skills/review/SKILL.md'] === 'unchanged')

const overrideActions = Object.fromEntries(scaffold.planScaffold(files, target, 'override').map(entry => [entry.path, entry.action]))
check('plan override: differing files are overwritten', overrideActions['CLAUDE.md'] === 'overwrite' && overrideActions['.claude/settings.json'] === 'overwrite')
check('plan does not touch the disk', read(target, 'CLAUDE.md') === '# Target rules\n' && !fs.existsSync(path.join(target, '.mcp.json')))

const merged = scaffold.applyScaffold(files, target, 'merge')
const settings = JSON.parse(read(target, '.claude/settings.json'))
check('apply merge: existing scalar values win', settings.model === 'sonnet')
check('apply merge: arrays gain the template entries', JSON.stringify(settings.permissions.allow) === '["Read","Bash(npm test)"]')
check('apply merge: missing keys are added', settings.enabledPlugins && settings.enabledPlugins['a@m'] === true)
check('apply merge: skipped markdown keeps its content', read(target, 'CLAUDE.md') === '# Target rules\n' && merged.skipped.includes('CLAUDE.md'))
check('apply merge: a second run has nothing left to write', scaffold.planScaffold(files, target, 'merge').every(entry => ['unchanged', 'skip'].includes(entry.action)))

scaffold.applyScaffold(files, target, 'override')
check('apply override: the template copy replaces the target', read(target, 'CLAUDE.md') === '# Source rules\n' && JSON.parse(read(target, '.claude/settings.json')).model === 'opus')

const kept = path.join(tmp, 'kept')
write(kept, '.claude/settings.json', JSON.stringify({ permissions: { allow: ['Read'] }, hooks: { Stop: [] }, model: 'sonnet', enabledPlugins: { 'z@m': true } }))
scaffold.applyScaffold(picked.files, kept, 'override')
const keptSettings = JSON.parse(read(kept, '.claude/settings.json'))
check('apply override: a template trimmed to some plugins keeps the target\'s other settings',
  keptSettings.model === 'sonnet' && keptSettings.hooks && JSON.stringify(keptSettings.permissions.allow) === '["Read"]' &&
  keptSettings.enabledPlugins['a@m'] === true && keptSettings.enabledPlugins['z@m'] === true, JSON.stringify(keptSettings))
scaffold.applyScaffold([{ path: '.claude/settings.json', content: JSON.stringify({ model: 'opus', permissions: { allow: ['Edit'] } }) }], kept, 'override')
const overriddenSettings = JSON.parse(read(kept, '.claude/settings.json'))
check('apply override: the template\'s values and arrays win', overriddenSettings.model === 'opus' && JSON.stringify(overriddenSettings.permissions.allow) === '["Edit"]')

const hostile = [{ path: '../escape.md', content: 'x' }, { path: '/etc/evil', content: 'x' }, { path: 'src/app.ts', content: 'x' }]
scaffold.applyScaffold(hostile, target, 'override')
check('apply: paths outside the AI config set are never written', !fs.existsSync(path.join(tmp, 'escape.md')) && !fs.existsSync(path.join(target, 'src/app.ts')))

const template = { id: 'abc', kind: 'workspace', name: 'Next.js backend', description: 'API', createdAt: 1, updatedAt: 2, files, plugins }
const draft = scaffold.parseTemplateExport(scaffold.serializeTemplate(template))
check('export/import: round-trips the name, kind, files and plugins',
  draft.name === template.name && draft.kind === 'workspace' && draft.files.length === files.length && JSON.stringify(draft.plugins) === JSON.stringify(plugins))
check('export: the file name is a slug', scaffold.templateExportFileName('Next.js Backend!') === 'next.js-backend.devrealm-template.json')

let rejected = false
try { scaffold.parseTemplateExport(JSON.stringify({ format: 'other', version: 1, template })) } catch { rejected = true }
check('import: rejects a file that is not a DevRealm template', rejected)
const filtered = scaffold.parseTemplateDraft({ kind: 'project', name: 'x', files: [{ path: '../x.md', content: 'x' }, { path: 'src/app.ts', content: 'x' }, { path: '.claude/worktrees/a/CLAUDE.md', content: 'x' }] })
check('import: drops unsafe paths', filtered.files.length === 0)
const hostilePlugins = scaffold.parseTemplateDraft({ kind: 'project', name: 'x', files: [], plugins: [{ id: 'a@m; rm -rf ~' }, { id: 'ok@m', marketplace: '$(touch x)' }] })
check('import: drops plugin ids and marketplace sources that are not plain names', hostilePlugins.plugins.length === 1 && hostilePlugins.plugins[0].marketplace === undefined)

const overridden = items.capturePlugins([
  { path: '.claude/settings.json', content: JSON.stringify({ enabledPlugins: { 'on@m': true, 'off@m': true } }) },
  { path: '.claude/settings.local.json', content: JSON.stringify({ enabledPlugins: { 'off@m': false } }) },
], {})
check('capture: settings.local.json can switch a plugin off', overridden.map(plugin => plugin.id).join() === 'on@m')

const hookTarget = path.join(tmp, 'hooks')
fs.mkdirSync(hookTarget)
scaffold.applyScaffold([{ path: '.claude/hooks/check.sh', content: '#!/bin/sh\nexit 0\n' }, { path: '.claude/hooks/notes.md', content: '# notes\n' }], hookTarget, 'merge')
check('apply: scripts with a shebang are executable, other files are not',
  (fs.statSync(path.join(hookTarget, '.claude/hooks/check.sh')).mode & 0o111) !== 0 && (fs.statSync(path.join(hookTarget, '.claude/hooks/notes.md')).mode & 0o111) === 0)

const outside = path.join(tmp, 'outside')
write(outside, 'id_rsa', 'PRIVATE KEY')
write(outside, 'dir/keep.txt', 'mine')
const linked = path.join(tmp, 'linked')
write(linked, 'AGENTS.md', '# agents\n')
fs.symlinkSync('AGENTS.md', path.join(linked, 'CLAUDE.md'))
fs.symlinkSync(path.join(outside, 'id_rsa'), path.join(linked, '.mcp.json'))
fs.mkdirSync(path.join(linked, '.claude'))
fs.symlinkSync(path.join(outside, 'id_rsa'), path.join(linked, '.claude/settings.json'))
write(linked, '.env', 'SECRET_ENV')
write(linked, '.claude/real-agents/reviewer.md', '# reviewer\n')
write(linked, 'shared/notes.md', 'not config')
fs.symlinkSync('real-agents', path.join(linked, '.claude/agents'))
fs.symlinkSync('../shared', path.join(linked, '.claude/skills'))
fs.symlinkSync('../.env', path.join(linked, '.claude/notes.md'))
fs.symlinkSync('../AGENTS.md', path.join(linked, '.claude/rules.md'))
fs.symlinkSync('.', path.join(linked, '.claude/loop'))
fs.symlinkSync(path.join(outside, 'dir'), path.join(linked, '.claude/commands'))
const linkedFiles = scaffold.captureFiles(linked)
check('capture: a symlink inside the folder is read', linkedFiles.some(file => file.path === 'CLAUDE.md' && file.content === '# agents\n'))
check('capture: symlinks leaving the folder are never read', !linkedFiles.some(file => file.content.includes('PRIVATE KEY') || file.content === 'mine'))
check('capture: a symlink to a file inside the folder that is not AI config is never read',
  !linkedFiles.some(file => file.content === 'SECRET_ENV' || file.content === 'not config'), linkedFiles.map(file => file.path).join(','))
check('capture: symlinked files and folders under .claude that stay inside are read',
  linkedFiles.some(file => file.path === '.claude/agents/reviewer.md') && linkedFiles.some(file => file.path === '.claude/rules.md'), linkedFiles.map(file => file.path).join(','))

const trap = path.join(tmp, 'trap')
fs.mkdirSync(trap)
fs.symlinkSync(path.join(outside, 'dir'), path.join(trap, '.claude'))
fs.symlinkSync(path.join(outside, 'id_rsa'), path.join(trap, 'CLAUDE.md'))
fs.symlinkSync(path.join(outside, 'missing.txt'), path.join(trap, 'AGENTS.md'))
const trapped = scaffold.applyScaffold([
  { path: '.claude/keep.txt', content: 'overwritten' },
  { path: '.claude/new.md', content: 'planted' },
  { path: 'CLAUDE.md', content: 'overwritten' },
  { path: 'AGENTS.md', content: 'planted' },
], trap, 'override')
const inner = path.join(tmp, 'inner')
write(inner, 'src/config.json', '{"keep":true}')
fs.mkdirSync(path.join(inner, '.claude'))
fs.symlinkSync('../src/config.json', path.join(inner, '.claude/settings.json'))
scaffold.applyScaffold([{ path: '.claude/settings.json', content: '{"planted":true}' }], inner, 'override')
check('apply: never writes through a symlink to a project file that is not AI config', read(inner, 'src/config.json') === '{"keep":true}')
check('apply: never writes through a symlink that leaves the target',
  trapped.written.length === 0 && read(outside, 'dir/keep.txt') === 'mine' && read(outside, 'id_rsa') === 'PRIVATE KEY' &&
  !fs.existsSync(path.join(outside, 'dir/new.md')) && !fs.existsSync(path.join(outside, 'missing.txt')))

const home = path.join(tmp, 'home')
write(home, '.claude/CLAUDE.md', '# Mine\n')
write(home, '.claude/settings.json', '{}')
write(home, '.claude/skills/tidy/SKILL.md', 'x')
write(home, '.claude/history.jsonl', 'secret')
write(home, '.claude/hooks/state/run.json', 'runtime')
write(home, '.claude/skills/.trash/old/SKILL.md', 'deleted')
write(home, '.claude/projects/p/session.jsonl', 'secret')
write(home, 'CLAUDE.md', 'not user config')
write(home, '.ssh/id_rsa', 'HOME KEY')
fs.symlinkSync('../../.ssh', path.join(home, '.claude/skills/ssh'))
const realHome = process.env.HOME
process.env.HOME = home
const homePaths = scaffold.captureFiles(home).map(file => file.path)
check('user scope: capture reads only the Claude config in ~/.claude',
  JSON.stringify(homePaths) === JSON.stringify(['.claude/CLAUDE.md', '.claude/settings.json', '.claude/skills/tidy/SKILL.md']))
check('user scope: a symlink under ~/.claude to another part of the home folder is never read',
  !scaffold.captureFiles(home).some(file => file.content === 'HOME KEY'))
const homeLink = path.join(tmp, 'home-link')
fs.symlinkSync(home, homeLink)
check('user scope: a path that reaches the home folder through a symlink gets the same limits',
  JSON.stringify(scaffold.captureFiles(homeLink).map(file => file.path)) === JSON.stringify(homePaths))
const homePlan = scaffold.planScaffold([{ path: 'CLAUDE.md', content: '# Rules\n' }, { path: '.mcp.json', content: '{}' }, { path: '.claude/projects/x', content: 'x' }], home, 'override')
check('user scope: a project CLAUDE.md goes to ~/.claude/CLAUDE.md, the rest is skipped',
  JSON.stringify(homePlan) === JSON.stringify([{ path: '.claude/CLAUDE.md', action: 'overwrite' }, { path: '.mcp.json', action: 'skip' }, { path: '.claude/projects/x', action: 'skip' }]))
process.env.HOME = realHome

fs.rmSync(tmp, { recursive: true, force: true })
process.exit(summary())
