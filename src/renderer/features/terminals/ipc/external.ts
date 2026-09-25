export function openExternalUrl(url: string): Promise<void> {
  return window.electronAPI.shell.openExternal(url)
}
