export function getUserHome(): Promise<string> {
  return window.electronAPI.claude.userHome()
}
