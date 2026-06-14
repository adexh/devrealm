import fs from 'fs'
import path from 'path'
import os from 'os'
import defaultEditorSettingsJson from '../shared/config/codeEditors.json'
import type { AppConfig, AppData, AppInsights, AuthUser, Workspace, Repo, CodeEditorConfig, CodeEditorSettings } from '../shared/types'
import { CONFIG_FILE_NAME, DATA_DIR_NAME, SCHEMA_VERSION, STALE_REPO_MS, WORKSPACES_FILE_NAME } from './constants'

const DATA_DIR = path.join(os.homedir(), DATA_DIR_NAME)
const WORKSPACES_FILE = path.join(DATA_DIR, WORKSPACES_FILE_NAME)
const CONFIG_FILE = path.join(DATA_DIR, CONFIG_FILE_NAME)

type LegacyRepo = Omit<Repo, 'workspaceId'> & {
  workspaceId?: string
}

type LegacyWorkspace = Workspace & {
  repos?: LegacyRepo[]
  repoIds?: string[]
}

type LegacyAppData = {
  schemaVersion?: number
  workspaces?: LegacyWorkspace[]
  repos?: LegacyRepo[]
  insights?: AppInsights
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

function calculateInsights(workspaces: Workspace[], repos: Repo[]): AppInsights {
  const now = Date.now()
  const lastOpenedByWorkspace = new Map<string, number>()
  for (const workspace of workspaces) {
    lastOpenedByWorkspace.set(workspace.id, workspace.createdAt)
  }
  for (const repo of repos) {
    const current = lastOpenedByWorkspace.get(repo.workspaceId) ?? 0
    if (repo.lastOpenedAt > current) lastOpenedByWorkspace.set(repo.workspaceId, repo.lastOpenedAt)
  }

  return {
    totalWorkspaceCount: workspaces.length,
    totalRepoCount: repos.length,
    totalDiskSize: repos.reduce((total, repo) => total + repo.size, 0),
    staleRepoCount: repos.filter(repo => now - repo.lastOpenedAt > STALE_REPO_MS).length,
    activeWorkspaceCount7d: [...lastOpenedByWorkspace.values()].filter(lastOpenedAt => lastOpenedAt > now - 7 * 86400000).length,
    updatedAt: now,
  }
}

function normalizeRepo(repo: LegacyRepo, workspaceId: string): Repo {
  return {
    ...repo,
    workspaceId: repo.workspaceId ?? workspaceId,
  }
}

function normalizeData(raw: LegacyAppData): AppData {
  const workspaces: Workspace[] = (raw.workspaces ?? []).map(({ repoIds: _repoIds, repos: _repos, ...workspace }) => workspace)
  const workspaceIds = new Set(workspaces.map(workspace => workspace.id))
  const repos: Repo[] = []
  const seenRepoIds = new Set<string>()

  for (const repo of raw.repos ?? []) {
    if (!repo.workspaceId || !workspaceIds.has(repo.workspaceId) || seenRepoIds.has(repo.id)) continue
    repos.push(normalizeRepo(repo, repo.workspaceId))
    seenRepoIds.add(repo.id)
  }

  const legacyRepoById = new Map((raw.repos ?? []).map(repo => [repo.id, repo]))
  for (const workspace of raw.workspaces ?? []) {
    const nestedRepos = workspace.repos ?? []
    const referencedRepos = (workspace.repoIds ?? [])
      .map(repoId => legacyRepoById.get(repoId))
      .filter(Boolean) as LegacyRepo[]
    for (const repo of [...nestedRepos, ...referencedRepos]) {
      if (seenRepoIds.has(repo.id)) continue
      repos.push(normalizeRepo(repo, workspace.id))
      seenRepoIds.add(repo.id)
    }
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    workspaces,
    repos,
    insights: calculateInsights(workspaces, repos),
  }
}

function isCurrentSchema(raw: LegacyAppData): boolean {
  return raw.schemaVersion === SCHEMA_VERSION
    && Array.isArray(raw.repos)
    && raw.repos.every(repo => typeof repo.workspaceId === 'string')
    && (raw.workspaces ?? []).every(workspace => !workspace.repoIds && !workspace.repos)
}

function writeNormalizedData(data: AppData): void {
  fs.writeFileSync(WORKSPACES_FILE, JSON.stringify(data, null, 2))
}

export function readData(): AppData {
  ensureDataDir()
  if (!fs.existsSync(WORKSPACES_FILE)) {
    return normalizeData({ workspaces: [], repos: [] })
  }
  const raw = fs.readFileSync(WORKSPACES_FILE, 'utf-8')
  const parsed = JSON.parse(raw) as LegacyAppData
  const normalized = normalizeData(parsed)
  if (!isCurrentSchema(parsed)) {
    writeNormalizedData(normalized)
  }
  return normalized
}

export function writeData(data: AppData): void {
  ensureDataDir()
  writeNormalizedData(normalizeData(data))
}

export function readConfig(): AppConfig {
  ensureDataDir()
  if (!fs.existsSync(CONFIG_FILE)) {
    return {}
  }
  const raw = fs.readFileSync(CONFIG_FILE, 'utf-8')
  return JSON.parse(raw)
}

export function writeConfig(config: AppConfig): void {
  ensureDataDir()
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2))
}

export function getDataSnapshot(): AppData {
  return readData()
}

export function getWorkspaces(): Workspace[] {
  return readData().workspaces
}

export function getRepos(): Repo[] {
  return readData().repos
}

export function saveWorkspace(workspace: Workspace): void {
  const data = readData()
  const idx = data.workspaces.findIndex(w => w.id === workspace.id)
  if (idx >= 0) {
    data.workspaces[idx] = workspace
  } else {
    data.workspaces.push(workspace)
  }
  writeData(data)
}

export function deleteWorkspace(id: string): void {
  const data = readData()
  data.workspaces = data.workspaces.filter(workspace => workspace.id !== id)
  data.repos = data.repos.filter(repo => repo.workspaceId !== id)
  writeData(data)
}

export function saveRepo(repo: Repo): void {
  const data = readData()
  if (!data.workspaces.some(workspace => workspace.id === repo.workspaceId)) return
  const idx = data.repos.findIndex(item => item.id === repo.id)
  if (idx >= 0) {
    data.repos[idx] = repo
  } else {
    data.repos.push(repo)
  }
  writeData(data)
}

export function removeRepoFromWorkspace(workspaceId: string, repoId: string): void {
  const data = readData()
  data.repos = data.repos.filter(repo => repo.id !== repoId || repo.workspaceId !== workspaceId)
  writeData(data)
}

export function deleteRepo(id: string): void {
  const data = readData()
  data.repos = data.repos.filter(repo => repo.id !== id)
  writeData(data)
}

function defaultEditorSettings(): CodeEditorSettings {
  return defaultEditorSettingsJson satisfies CodeEditorSettings
}

function mergeEditorSettings(saved?: CodeEditorSettings): CodeEditorSettings {
  const defaults = defaultEditorSettings()
  if (!saved) return defaults

  const editors = new Map<string, CodeEditorConfig>()
  defaults.editors.forEach(editor => editors.set(editor.id, editor))
  saved.editors.forEach(editor => editors.set(editor.id, editor))

  const defaultEditorId = editors.has(saved.defaultEditorId)
    ? saved.defaultEditorId
    : defaults.defaultEditorId

  return {
    defaultEditorId,
    editors: Array.from(editors.values()),
  }
}

export function getEditorSettings(): CodeEditorSettings {
  return mergeEditorSettings(readConfig().editorSettings)
}

export function saveEditorSettings(settings: CodeEditorSettings): CodeEditorSettings {
  const merged = mergeEditorSettings(settings)
  const config = readConfig()
  config.editorSettings = merged
  writeConfig(config)
  return merged
}

export function getAuthToken(): string | null {
  return readConfig().authToken ?? null
}

export function saveAuthToken(token: string): void {
  const config = readConfig()
  config.authToken = token
  writeConfig(config)
}

export function getAuthUser(): AuthUser | null {
  return readConfig().authUser ?? null
}

export function saveAuthUser(user: AuthUser): void {
  const config = readConfig()
  config.authUser = user
  writeConfig(config)
}

export function clearAuth(): void {
  const config = readConfig()
  delete config.authToken
  delete config.authUser
  writeConfig(config)
}
