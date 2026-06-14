export function readClaudeSettings(workspacePath: string) {
  return window.electronAPI.claude.readSettings(workspacePath)
}

export function readClaudeMdFiles(workspacePath: string) {
  return window.electronAPI.claude.readMdFiles(workspacePath)
}

export function listClaudePluginsAndSkills(workspacePath: string) {
  return window.electronAPI.claude.pluginsAndSkills(workspacePath)
}
