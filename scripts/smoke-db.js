// Checks the database layer: migrations apply in order, and a backup is taken
// before the schema changes.
//
//   npm run smoke:db
//
// Drives the real runner from dist/shared/node/db.js with its own migration
// list, so this tests the shipped code rather than a copy of its logic. Runs
// under plain node: node:sqlite is a builtin and no native module is involved.

const { DatabaseSync } = require('node:sqlite')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { runMigrations } = require(path.resolve(__dirname, '../dist/shared/node/db.js'))

let failures = 0
const check = (label, ok, extra = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${extra ? ' | ' + extra : ''}`)
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devrealm-db-smoke-'))
const file = path.join(dir, 'devrealm.db')

function open(migrations) {
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL')
  runMigrations(db, file, migrations)
  return db
}

const v1 = [db => db.exec('CREATE TABLE terminal_sessions (id TEXT PRIMARY KEY, title TEXT)')]
const v2 = [...v1, db => db.exec('ALTER TABLE terminal_sessions ADD COLUMN note TEXT')]
const v3 = [...v2, db => db.exec('CREATE INDEX terminal_sessions_title ON terminal_sessions (title)')]

let db = open(v1)
check('1 first open applies migration 1', db.prepare('PRAGMA user_version').get().user_version === 1)
db.prepare('INSERT INTO terminal_sessions (id, title) VALUES (?, ?)').run('s1', 'before upgrade')
check('2 no backup taken on a fresh database', !fs.existsSync(`${file}.bak-v0`))
db.close()

db = open(v2)
check('3 second open applies migration 2', db.prepare('PRAGMA user_version').get().user_version === 2)
check('4 existing row survives the migration',
      db.prepare('SELECT title FROM terminal_sessions WHERE id = ?').get('s1').title === 'before upgrade')
db.close()

const backupPath = `${file}.bak-v1`
check('5 a backup was taken before migrating', fs.existsSync(backupPath))

if (fs.existsSync(backupPath)) {
  const backup = new DatabaseSync(backupPath, { readOnly: true })
  check('6 the backup holds the pre-migration schema',
        backup.prepare('PRAGMA user_version').get().user_version === 1)
  check('7 the backup holds the pre-migration data',
        backup.prepare('SELECT title FROM terminal_sessions WHERE id = ?').get('s1').title === 'before upgrade')
  const columns = backup.prepare('PRAGMA table_info(terminal_sessions)').all().map(c => c.name)
  check('8 the backup predates the new column', !columns.includes('note'), columns.join(', '))
  backup.close()
  check('9 the backup is a single file, no -wal or -shm',
        !fs.existsSync(`${backupPath}-wal`) && !fs.existsSync(`${backupPath}-shm`))
}

db = open(v2)
check('10 reopening an up-to-date database takes no new backup', !fs.existsSync(`${file}.bak-v2`))
db.close()

db = open(v3)
check('11 a third migration backs up at its own version', fs.existsSync(`${file}.bak-v2`))
db.close()

// A failing migration must leave the database exactly as it was.
const broken = [...v3, db => db.exec('THIS IS NOT SQL')]
let threw = false
try { open(broken).close() } catch { threw = true }
const after = new DatabaseSync(file, { readOnly: true })
check('12 a failing migration throws', threw)
check('13 a failing migration rolls back the version',
      after.prepare('PRAGMA user_version').get().user_version === 3)
check('14 a failing migration leaves the data intact',
      after.prepare('SELECT title FROM terminal_sessions WHERE id = ?').get('s1').title === 'before upgrade')
after.close()

fs.rmSync(dir, { recursive: true, force: true })
console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
