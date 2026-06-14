export function exportWorkspace(id: string): Promise<string | null> {
  return window.electronAPI.workspaces.export(id)
}

export function deleteWorkspace(id: string): Promise<void> {
  return window.electronAPI.workspaces.delete(id)
}
