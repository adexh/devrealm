import { ipcMain, shell } from 'electron'
import type { IdeSnapshot, IdeSnapshotOptions } from '../../shared/ide'
import { closeIdeWindow, focusIdeWindow, quitIde } from './actions'
import { isAccessibilityGranted } from './macWindows'
import { captureIdeSnapshot } from './snapshot'

const ACCESSIBILITY_SETTINGS_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'

function snapshotOptions(value: unknown): IdeSnapshotOptions {
  const options = value as Partial<IdeSnapshotOptions> | null | undefined
  return { fresh: options?.fresh === true }
}

/** Argument shapes are checked inside the actions; the handlers only route. */
export function registerIdeIpcHandlers(): void {
  ipcMain.handle('ides:snapshot', (_, options: unknown): Promise<IdeSnapshot> => captureIdeSnapshot(snapshotOptions(options)))

  ipcMain.handle('ides:focus-window', (_, ref: unknown) => focusIdeWindow(ref as never))

  ipcMain.handle('ides:close-window', (_, ref: unknown) => closeIdeWindow(ref as never))

  ipcMain.handle('ides:quit', (_, ide: unknown) => quitIde(ide))

  /** Passing `true` shows the system prompt; the result is what the OS says right now. */
  ipcMain.handle('ides:request-accessibility', (): boolean => isAccessibilityGranted(true))

  ipcMain.handle('ides:open-accessibility-settings', async () => {
    if (process.platform !== 'darwin') return
    await shell.openExternal(ACCESSIBILITY_SETTINGS_URL)
  })
}
