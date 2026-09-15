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

  migrate(db)
  openDatabases.set(filePath, db)
  return db
}

function migrate(db: DatabaseSync): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined
  let version = row?.user_version ?? 0

  while (version < MIGRATIONS.length) {
    db.exec('BEGIN')
    try {
      MIGRATIONS[version](db)
      version += 1
      db.exec(`PRAGMA user_version = ${version}`)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
}

export function closeDatabase(filePath: string = DEFAULT_DB_PATH): void {
  const db = openDatabases.get(filePath)
  if (!db) return
  openDatabases.delete(filePath)
  try { db.close() } catch { /* already closed */ }
}
