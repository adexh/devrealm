import type { WorkspaceFileTreeNode } from '../../../../shared/types'

export function listWorkspaceFiles(rootPath: string): Promise<WorkspaceFileTreeNode[]> {
  return window.electronAPI.workspaces.listFiles(rootPath)
}

export function createWorkspaceFile(rootPath: string, relativePath: string): Promise<void> {
  return window.electronAPI.workspaces.createFile({ rootPath, relativePath })
}

export function createWorkspaceFolder(rootPath: string, relativePath: string): Promise<void> {
  return window.electronAPI.workspaces.createFolder({ rootPath, relativePath })
}

export function deleteWorkspaceEntry(rootPath: string, relativePath: string): Promise<void> {
  return window.electronAPI.workspaces.deleteEntry({ rootPath, relativePath })
}
