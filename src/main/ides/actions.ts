import { execFile } from 'child_process'
import type { IdeId, IdeWindowRef } from '../../shared/ide'
import { openInCodeEditor } from '../editorLauncher'
import { closeWindow, isAccessibilityGranted, quitApp, raiseWindow } from './macWindows'
import { findRunningMain, invalidateWindowCache } from './snapshot'
import { openFolderWithCli, resolveVsCodeCli, VSCODE_BUNDLE_ID } from './vscodeCli'

function assertVsCode(ide: IdeId): void {
  if (ide !== 'vscode') throw new Error(`Unsupported IDE "${ide}".`)
}

/**
 * A known folder is focused through the CLI, which VS Code resolves to the
 * window already holding it. That needs no permission and works on every
 * platform; the title route is only for windows with no folder.
 */
export async function focusIdeWindow(ref: IdeWindowRef): Promise<void> {
  assertVsCode(ref.ide)
  if (ref.folderPath) {
    const main = await findRunningMain()
    const cli = resolveVsCodeCli(main?.command ?? null)
    if (cli) {
      await openFolderWithCli(cli, ref.folderPath)
    } else {
      await openInCodeEditor(ref.folderPath, 'vscode')
    }
    return
  }
  if (process.platform === 'darwin' && isAccessibilityGranted(false)) {
    await raiseWindow(VSCODE_BUNDLE_ID, ref.title)
    return
  }
  throw new Error('This window has no folder DevRealm can open, and raising it by title needs Accessibility permission.')
}

export async function closeIdeWindow(ref: IdeWindowRef): Promise<void> {
  assertVsCode(ref.ide)
  if (process.platform !== 'darwin') {
    throw new Error('Closing windows is only supported on macOS.')
  }
  if (!isAccessibilityGranted(false)) {
    throw new Error('Closing a window needs Accessibility permission.')
  }
  await closeWindow(VSCODE_BUNDLE_ID, ref.title)
  invalidateWindowCache()
}

/** Asks the IDE to quit the way the OS would, so it prompts for unsaved files itself. */
export async function quitIde(ide: IdeId): Promise<void> {
  assertVsCode(ide)
  invalidateWindowCache()
  if (process.platform === 'darwin') {
    await quitApp(VSCODE_BUNDLE_ID, 'VS Code')
    return
  }
  const main = await findRunningMain()
  if (!main) throw new Error('VS Code is not running.')
  if (process.platform === 'win32') {
    await new Promise<void>((resolve, reject) => {
      execFile('taskkill', ['/PID', String(main.pid)], { windowsHide: true }, error => {
        if (error) reject(new Error(`Could not ask VS Code to quit: ${error.message}`))
        else resolve()
      })
    })
    return
  }
  process.kill(main.pid, 'SIGTERM')
}
