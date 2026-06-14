import type { Workspace, Repo, WorkspaceGithubConfig, WorkspaceGithubSyncResult } from '../../../../shared/types'

export function browseWorkspaceDir(): Promise<string | null> {
  return window.electronAPI.workspaces.browseDir()
}

export function browseWorkspaceImportFile(): Promise<string | null> {
  return window.electronAPI.workspaces.browseImportFile()
}

export function createWorkspace(data: { name: string; description?: string; rootPath?: string; github?: Partial<WorkspaceGithubConfig> }): Promise<Workspace> {
  return window.electronAPI.workspaces.create(data)
}

export function openWorkspaceFromDir(data: { dirPath: string; github?: Partial<WorkspaceGithubConfig> }): Promise<{ workspace: Workspace; repos: Repo[] }> {
  return window.electronAPI.workspaces.openFromDir(data)
}

export function importWorkspace(data: { rootPath: string; filePath: string }): Promise<{ workspace: Workspace; repos: Repo[] } | null> {
  return window.electronAPI.workspaces.import(data)
}

export function exportWorkspace(id: string): Promise<string | null> {
  return window.electronAPI.workspaces.export(id)
}

export function updateWorkspace(workspace: Workspace): Promise<Workspace> {
  return window.electronAPI.workspaces.update(workspace)
}

export function syncWorkspaceGithub(workspaceId: string): Promise<WorkspaceGithubSyncResult | null> {
  return window.electronAPI.workspaces.syncGithub(workspaceId)
}

export function cloneWorkspaceGithub(workspaceId: string): Promise<Workspace> {
  return window.electronAPI.workspaces.cloneGithub(workspaceId)
}
