export function setPluginEnabled(data: {
  workspacePath: string
  pluginId: string
  enabled: boolean
}): Promise<void> {
  return window.electronAPI.claude.setPluginEnabled(data)
}

export function removePlugin(data: {
  workspacePath: string
  pluginId: string
}): Promise<void> {
  return window.electronAPI.claude.removePlugin(data)
}
