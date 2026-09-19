export function openRepoInEditor(data: { targetPath: string; repoId: string; workspaceId: string }): Promise<void> {
  return window.electronAPI.repos.openInEditor(data)
}
