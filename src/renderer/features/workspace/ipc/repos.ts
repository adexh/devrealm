import type { Repo } from '../../../../shared/types'

export function checkRepoAiCoverage(repos: { id: string; path: string }[]): Promise<Record<string, boolean>> {
  return window.electronAPI.repos.checkAiCoverage(repos)
}

export function addRepo(data: { repoPath: string; workspaceId: string }): Promise<Repo> {
  return window.electronAPI.repos.add(data)
}

export function checkPathExists(folderPath: string): Promise<boolean> {
  return window.electronAPI.repos.pathExists(folderPath)
}

export function deleteFolderAtPath(folderPath: string): Promise<void> {
  return window.electronAPI.repos.deleteFolder(folderPath)
}

export function cloneRepo(data: { url: string; destDir: string; workspaceId: string; repoId?: string }): Promise<Repo> {
  return window.electronAPI.repos.clone(data)
}

export function openRepoInEditor(repoPath: string, editorId?: string): Promise<void> {
  return window.electronAPI.repos.openInEditor({ targetPath: repoPath, editorId })
}

export function removeRepoFromWorkspace(repoId: string, workspaceId: string): Promise<void> {
  return window.electronAPI.repos.removeFromWorkspace({ repoId, workspaceId })
}

export function scanWorkspaceForRepos(workspacePath: string, existingRepoPaths: string[]): Promise<{ name: string; path: string }[]> {
  return window.electronAPI.repos.scanWorkspace({ workspacePath, existingRepoPaths })
}
