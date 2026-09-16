import { ipcMain, type WebContents } from 'electron'
import type { TerminalOpenRequest, TerminalSessionInfo } from '../../shared/terminal'
import { attachSession, detachSession } from './bridge'
import { daemonClient } from './daemonClient'

/**
 * Control plane only. Input, output and resize travel over the session's
 * MessagePort, never through these handlers.
 */
export function registerTerminalIpcHandlers(getWebContents: () => WebContents | null): void {
  daemonClient.onEvent(event => {
    getWebContents()?.send('terminals:event', event)
  })

  ipcMain.handle('terminals:list', async (): Promise<TerminalSessionInfo[]> => {
    await daemonClient.ensureConnected()
    return daemonClient.listSessions()
  })

  ipcMain.handle('terminals:open', async (_, request: TerminalOpenRequest): Promise<TerminalSessionInfo> => {
    await daemonClient.ensureConnected()
    return daemonClient.control<TerminalSessionInfo>({ op: 'open', params: request })
  })

  ipcMain.handle('terminals:close', async (_, id: string): Promise<void> => {
    detachSession(id)
    await daemonClient.control({ op: 'close', params: { id } })
  })

  ipcMain.handle('terminals:rename', async (_, data: { id: string; title: string }): Promise<void> => {
    await daemonClient.control({ op: 'rename', params: data })
  })

  ipcMain.handle('terminals:attach', async (event, data: { id: string; cols: number; rows: number }) => {
    await daemonClient.ensureConnected()
    return attachSession(event.sender, data.id, data.cols, data.rows)
  })

  ipcMain.handle('terminals:clear', async (_, id: string): Promise<void> => {
    await daemonClient.control({ op: 'clear', params: { id } })
  })

  ipcMain.handle('terminals:detach', async (_, id: string): Promise<void> => {
    detachSession(id)
    await daemonClient.control({ op: 'detach', params: { id } })
  })
}
