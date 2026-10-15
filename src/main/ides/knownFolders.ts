import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import * as store from '../store'
import type { Repo, Workspace } from '../../shared/types'

const WORKSPACE_FILE_EXT = '.code-workspace'

export type KnownFolder = {
  /** The directory the window works in. */
  path: string
  /** What the CLI is given to reach the window: the folder, or the `.code-workspace` file. */
  openPath: string
  repoId: string | null
  workspaceId: string | null
  /** Also named in VS Code's own window state, so it was open at the last quit. */
  seenByIde: boolean
}

/** A folder or workspace file VS Code named in its own state. */
export type IdeStateEntry = {
  openPath: string
  /** The `.code-workspace` name without extension, which is what the title shows. */
  rootName: string
}

/** Root name, lower-cased, to every folder that has it. */
export type KnownFolderIndex = Map<string, KnownFolder[]>

export type FolderLookup =
  | { rootName: string; folder: KnownFolder; ambiguous: false }
  | { rootName: string; folder: null; ambiguous: true }

export function resolveRepoPath(repo: Repo, workspaces: Workspace[]): string | null {
  const raw = repo.path?.trim()
  if (!raw) return null
  if (path.isAbsolute(raw)) return path.normalize(raw)
  const workspace = workspaces.find(item => item.id === repo.workspaceId)
  return workspace?.rootPath ? path.resolve(workspace.rootPath, raw) : null
}

export function vscodeStorageFile(): string {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library/Application Support/Code/User/globalStorage/storage.json')
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData/Roaming'), 'Code/User/globalStorage/storage.json')
  }
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'), 'Code/User/globalStorage/storage.json')
}

function localPath(uri: unknown): string | null {
  if (typeof uri !== 'string' || !uri.startsWith('file:')) return null
  try {
    return fileURLToPath(uri)
  } catch {
    return null
  }
}

/**
 * `windowsState` is written at quit, so this is the set of windows VS Code
 * restored at launch, not the live set. It still names folders and workspace
 * files DevRealm does not track, which is enough to turn a title into a path.
 */
export function parseIdeStateEntries(json: unknown): IdeStateEntry[] {
  const state = (json as { windowsState?: { openedWindows?: unknown[]; lastActiveWindow?: unknown } } | null)?.windowsState
  if (!state) return []
  const raw = [...(Array.isArray(state.openedWindows) ? state.openedWindows : []), state.lastActiveWindow]
  const byPath = new Map<string, IdeStateEntry>()
  for (const entry of raw) {
    const record = entry as { folder?: unknown; workspace?: { configPath?: unknown } } | null
    const folder = localPath(record?.folder)
    if (folder) {
      byPath.set(folder, { openPath: folder, rootName: path.basename(folder) })
      continue
    }
    const workspaceFile = localPath(record?.workspace?.configPath)
    if (workspaceFile) {
      byPath.set(workspaceFile, { openPath: workspaceFile, rootName: path.basename(workspaceFile, WORKSPACE_FILE_EXT) })
    }
  }
  return [...byPath.values()]
}

let storageCache: { file: string; mtimeMs: number; entries: IdeStateEntry[] } | null = null

export function readIdeStateEntries(file = vscodeStorageFile()): IdeStateEntry[] {
  try {
    const stat = fs.statSync(file)
    if (storageCache && storageCache.file === file && storageCache.mtimeMs === stat.mtimeMs) {
      return storageCache.entries
    }
    const entries = parseIdeStateEntries(JSON.parse(fs.readFileSync(file, 'utf8')))
    storageCache = { file, mtimeMs: stat.mtimeMs, entries }
    return entries
  } catch {
    return []
  }
}

export function buildKnownFolderIndex(
  repos: Repo[] = store.getRepos(),
  workspaces: Workspace[] = store.getWorkspaces(),
  ideEntries: IdeStateEntry[] = readIdeStateEntries(),
): KnownFolderIndex {
  const index: KnownFolderIndex = new Map()
  const byOpenPath = new Map<string, KnownFolder>()
  const add = (rootName: string, folder: KnownFolder) => {
    byOpenPath.set(folder.openPath, folder)
    const key = rootName.toLowerCase()
    const bucket = index.get(key)
    if (bucket) bucket.push(folder)
    else index.set(key, [folder])
  }

  for (const repo of repos) {
    const resolved = resolveRepoPath(repo, workspaces)
    if (!resolved || byOpenPath.has(resolved)) continue
    add(path.basename(resolved), { path: resolved, openPath: resolved, repoId: repo.id, workspaceId: repo.workspaceId, seenByIde: false })
  }
  for (const entry of ideEntries) {
    const openPath = path.normalize(entry.openPath)
    const existing = byOpenPath.get(openPath)
    if (existing) {
      existing.seenByIde = true
      continue
    }
    const isWorkspaceFile = openPath.endsWith(WORKSPACE_FILE_EXT)
    add(entry.rootName, {
      path: isWorkspaceFile ? path.dirname(openPath) : openPath,
      openPath,
      repoId: null,
      workspaceId: null,
      seenByIde: true,
    })
  }
  return index
}

/**
 * The first candidate naming a known folder wins. When several folders share
 * that name, the one VS Code itself lists as open is preferred; if that does
 * not settle it, the window is reported as ambiguous rather than pinned to a
 * repo that may be the wrong one.
 */
export function lookupFolder(index: KnownFolderIndex, candidates: string[]): FolderLookup | null {
  for (const candidate of candidates) {
    const matches = index.get(candidate.toLowerCase())
    if (!matches || matches.length === 0) continue
    if (matches.length === 1) return { rootName: candidate, folder: matches[0], ambiguous: false }
    const seen = matches.filter(folder => folder.seenByIde)
    if (seen.length === 1) return { rootName: candidate, folder: seen[0], ambiguous: false }
    return { rootName: candidate, folder: null, ambiguous: true }
  }
  return null
}
