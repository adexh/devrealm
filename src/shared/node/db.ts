import fs from 'fs'
import os from 'os'
import path from 'path'
import { DatabaseSync } from 'node:sqlite'

/**
 * The app's SQLite database, shared by the main process and the PTY daemon.
 *
 * `node:sqlite` is built into the Node that Electron bundles, so this adds no
 * native module: nothing to rebuild against Electron's ABI and nothing to
 * asarUnpack, unlike node-pty.
 *
 * Node-only, which is why it lives under src/shared/node and is excluded from
 * the renderer's tsconfig. The renderer reaches data through IPC, never here.
 */

export const DEFAULT_DB_PATH = path.join(os.homedir(), '.workspace-manager', 'devrealm.db')

/**
 * Ordered, append-only. Each entry moves the schema forward by one version and
 * is applied inside a transaction. Never edit or reorder a shipped migration.
 */
const MIGRATIONS: ((db: DatabaseSync) => void)[] = [
  db => {
    db.exec(`
      CREATE TABLE terminal_sessions (
        id             TEXT PRIMARY KEY,
        workspace_id   TEXT NOT NULL,
        repo_id        TEXT,
        repo_name      TEXT NOT NULL,
        title          TEXT NOT NULL,
        cwd            TEXT NOT NULL,
        shell          TEXT NOT NULL,
        cols           INTEGER NOT NULL,
        rows           INTEGER NOT NULL,
        pid            INTEGER NOT NULL,
        exit_code      INTEGER,
        created_at     INTEGER NOT NULL,
        last_active_at INTEGER NOT NULL
      );
      CREATE INDEX terminal_sessions_workspace
        ON terminal_sessions (workspace_id);
    `)
  },
]

/** How many pre-migration backups to keep before pruning the oldest. */
const BACKUPS_KEPT = 3

const openDatabases = new Map<string, DatabaseSync>()

export function openDatabase(filePath: string = DEFAULT_DB_PATH): DatabaseSync {
  const existing = openDatabases.get(filePath)
  if (existing) return existing

  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const db = new DatabaseSync(filePath)

  // WAL lets the daemon write while another process reads, and survives an
  // unclean exit without corrupting the file.
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')

  runMigrations(db, filePath, MIGRATIONS)
  openDatabases.set(filePath, db)
  return db
}

/**
 * Exported so tests can drive the real runner with their own migration list;
 * production always passes MIGRATIONS.
 */
export function runMigrations(
  db: DatabaseSync,
  filePath: string,
  migrations: ((db: DatabaseSync) => void)[]
): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined
  let version = row?.user_version ?? 0

  // On a desktop there is no snapshot to restore from and nobody to call, so a
  // failed migration has to be recoverable by hand. Version 0 has nothing worth
  // keeping, and an up-to-date database has nothing to do.
  if (version > 0 && version < migrations.length) {
    backup(db, filePath, version)
  }

  while (version < migrations.length) {
    db.exec('BEGIN')
    try {
      migrations[version](db)
      version += 1
      db.exec(`PRAGMA user_version = ${version}`)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
}

/**
 * Writes a consistent copy alongside the database, named for the schema version
 * it was taken at.
 *
 * `VACUUM INTO` rather than a file copy: it runs in a read transaction, so the
 * result includes commits still sitting in the WAL and is a single file with no
 * -wal or -shm sidecars to keep together.
 */
function backup(db: DatabaseSync, filePath: string, version: number): void {
  const target = `${filePath}.bak-v${version}`
  try {
    fs.rmSync(target, { force: true })
    db.prepare('VACUUM INTO ?').run(target)
    pruneBackups(filePath)
  } catch (error) {
    // A backup we cannot write is not a reason to block the app from starting,
    // but it is worth saying so before the schema changes underneath it.
    process.stderr.write(`[db] could not back up before migrating: ${String(error)}\n`)
  }
}

function pruneBackups(filePath: string): void {
  const directory = path.dirname(filePath)
  const prefix = `${path.basename(filePath)}.bak-v`

  const backups = fs.readdirSync(directory)
    .filter(name => name.startsWith(prefix))
    .map(name => ({ name, version: Number(name.slice(prefix.length)) }))
    .filter(entry => Number.isInteger(entry.version))
    .sort((a, b) => b.version - a.version)

  for (const stale of backups.slice(BACKUPS_KEPT)) {
    fs.rmSync(path.join(directory, stale.name), { force: true })
  }
}

export function closeDatabase(filePath: string = DEFAULT_DB_PATH): void {
  const db = openDatabases.get(filePath)
  if (!db) return
  openDatabases.delete(filePath)
  try { db.close() } catch { /* already closed */ }
}
