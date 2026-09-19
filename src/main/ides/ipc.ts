import { ipcMain, shell } from 'electron'
import type { IdeId, IdeSnapshot, IdeWindowRef } from '../../shared/ide'
import { closeIdeWindow, focusIdeWindow, quitIde } from './actions'
import { isAccessibilityGranted } from './macWindows'
import { captureIdeSnapshot } from './snapshot'

const ACCESSIBILITY_SETTINGS_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'

export function registerIdeIpcHandlers(): void {
  ipcMain.handle('ides:snapshot', (): Promise<IdeSnapshot> => captureIdeSnapshot())

  ipcMain.handle('ides:focus-window', (_, ref: IdeWindowRef) => focusIdeWindow(ref))

  ipcMain.handle('ides:close-window', (_, ref: IdeWindowRef) => closeIdeWindow(ref))

  ipcMain.handle('ides:quit', (_, ide: IdeId) => quitIde(ide))

  /** Passing `true` shows the system prompt; the result is what the OS says right now. */
  ipcMain.handle('ides:request-accessibility', (): boolean => isAccessibilityGranted(true))

  ipcMain.handle('ides:open-accessibility-settings', async () => {
    if (process.platform !== 'darwin') return
    await shell.openExternal(ACCESSIBILITY_SETTINGS_URL)
  })
}
