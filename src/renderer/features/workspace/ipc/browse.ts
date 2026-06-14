export function browseCloneDestination(): Promise<string | null> {
  return window.electronAPI.browse.destDir()
}
