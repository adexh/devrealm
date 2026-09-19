import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import * as store from '../store'
import type { Repo, Workspace } from '../../shared/types'

export type KnownFolder = {
  path: string
  repoId: string | null
  workspaceId: string | null
}

/** Basename, lower-cased, to every folder that has it. */
export type KnownFolderIndex = Map<string, KnownFolder[]>

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

/**
 * `windowsState` is written at quit, so this is the set of windows VS Code
 * restored at launch, not the live set. It still names folders DevRealm does
 * not track, which is enough to turn a title into a path.
 */
export function parseOpenedFolders(json: unknown): string[] {
  const state = (json as { windowsState?: { openedWindows?: unknown[]; lastActiveWindow?: unknown } } | null)?.windowsState
  if (!state) return []
  const entries = [...(Array.isArray(state.openedWindows) ? state.openedWindows : []), state.lastActiveWindow]
  const folders = new Set<string>()
  for (const entry of entries) {
    const folder = (entry as { folder?: unknown } | null)?.folder
    if (typeof folder !== 'string' || !folder.startsWith('file:')) continue
    try {
      folders.add(fileURLToPath(folder))
    } catch {
      // Not a path VS Code could have opened locally.
    }
  }
  return [...folders]
}

let storageCache: { file: string; mtimeMs: number; folders: string[] } | null = null

export function readVsCodeOpenedFolders(file = vscodeStorageFile()): string[] {
  try {
    const stat = fs.statSync(file)
    if (storageCache && storageCache.file === file && storageCache.mtimeMs === stat.mtimeMs) {
      return storageCache.folders
    }
    const folders = parseOpenedFolders(JSON.parse(fs.readFileSync(file, 'utf8')))
    storageCache = { file, mtimeMs: stat.mtimeMs, folders }
    return folders
  } catch {
    return []
  }
}

export function buildKnownFolderIndex(
  repos: Repo[] = store.getRepos(),
  workspaces: Workspace[] = store.getWorkspaces(),
  extraFolders: string[] = readVsCodeOpenedFolders(),
): KnownFolderIndex {
  const index: KnownFolderIndex = new Map()
  const seen = new Set<string>()
  const add = (folder: KnownFolder) => {
    if (seen.has(folder.path)) return
    seen.add(folder.path)
    const key = path.basename(folder.path).toLowerCase()
    const bucket = index.get(key)
    if (bucket) bucket.push(folder)
    else index.set(key, [folder])
  }

  for (const repo of repos) {
    const resolved = resolveRepoPath(repo, workspaces)
    if (resolved) add({ path: resolved, repoId: repo.id, workspaceId: repo.workspaceId })
  }
  for (const folder of extraFolders) {
    add({ path: path.normalize(folder), repoId: null, workspaceId: null })
  }
  return index
}

/** The first candidate that names a known folder wins; repos were indexed first so they win ties. */
export function lookupFolder(index: KnownFolderIndex, candidates: string[]): { rootName: string; folder: KnownFolder } | null {
  for (const candidate of candidates) {
    const matches = index.get(candidate.toLowerCase())
    if (matches && matches.length > 0) return { rootName: candidate, folder: matches[0] }
  }
  return null
}
