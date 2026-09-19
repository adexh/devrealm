import type { IdeId, IdeSnapshot, IdeSnapshotOptions, IdeWindowRef } from '../../../../shared/ide'

export function fetchIdeSnapshot(options?: IdeSnapshotOptions): Promise<IdeSnapshot> {
  return window.electronAPI.ides.snapshot(options)
}

export function focusIdeWindow(ref: IdeWindowRef): Promise<void> {
  return window.electronAPI.ides.focusWindow(ref)
}

export function closeIdeWindow(ref: IdeWindowRef): Promise<void> {
  return window.electronAPI.ides.closeWindow(ref)
}

export function quitIde(ide: IdeId): Promise<void> {
  return window.electronAPI.ides.quit(ide)
}

export function requestAccessibility(): Promise<boolean> {
  return window.electronAPI.ides.requestAccessibility()
}

export function openAccessibilitySettings(): Promise<void> {
  return window.electronAPI.ides.openAccessibilitySettings()
}

export function openExternalUrl(url: string): Promise<void> {
  return window.electronAPI.shell.openExternal(url)
}
