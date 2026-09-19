import { execFile } from 'child_process'
import type { IdeId, IdeWindowRef } from '../../shared/ide'
import { openInCodeEditor } from '../editorLauncher'
import { closeWindow, isAccessibilityGranted, quitApp, raiseWindow } from './macWindows'
import { findRunningMain, invalidateWindowCache } from './snapshot'
import { assertOpenablePath, openWithCli, resolveVsCodeCli, VSCODE_BUNDLE_ID } from './vscodeCli'

function assertVsCode(ide: unknown): asserts ide is IdeId {
  if (ide !== 'vscode') throw new Error(`Unsupported IDE "${String(ide)}".`)
}

/** IPC arguments come from the renderer and are shaped here, not assumed. */
export function assertWindowRef(value: unknown): asserts value is IdeWindowRef {
  const ref = value as Partial<IdeWindowRef> | null
  assertVsCode(ref?.ide)
  if (typeof ref.title !== 'string' || ref.title.length === 0 || ref.title.length > 4096) {
    throw new Error('Invalid window title.')
  }
  if (typeof ref.titleIndex !== 'number' || !Number.isInteger(ref.titleIndex) || ref.titleIndex < 1) {
    throw new Error('Invalid window position.')
  }
  if (ref.openPath !== null && typeof ref.openPath !== 'string') {
    throw new Error('Invalid window path.')
  }
}

/**
 * A known folder is focused through the CLI, which VS Code resolves to the
 * window already holding it. That needs no permission and works on every
 * platform; the title route is only for windows with no folder.
 */
export async function focusIdeWindow(ref: IdeWindowRef): Promise<void> {
  assertWindowRef(ref)
  if (ref.openPath) {
    assertOpenablePath(ref.openPath)
    const main = await findRunningMain()
    const cli = resolveVsCodeCli(main?.command ?? null)
    if (cli) {
      await openWithCli(cli, ref.openPath)
    } else {
      await openInCodeEditor(ref.openPath, 'vscode')
    }
    return
  }
  if (process.platform === 'darwin' && isAccessibilityGranted(false)) {
    await raiseWindow(VSCODE_BUNDLE_ID, ref.title, ref.titleIndex)
    return
  }
  throw new Error('This window has no folder DevRealm can open, and raising it by title needs Accessibility permission.')
}

export async function closeIdeWindow(ref: IdeWindowRef): Promise<void> {
  assertWindowRef(ref)
  if (process.platform !== 'darwin') {
    throw new Error('Closing windows is only supported on macOS.')
  }
  if (!isAccessibilityGranted(false)) {
    throw new Error('Closing a window needs Accessibility permission.')
  }
  await closeWindow(VSCODE_BUNDLE_ID, ref.title, ref.titleIndex)
  invalidateWindowCache()
}

/** Asks the IDE to quit the way the OS would, so it prompts for unsaved files itself. */
export async function quitIde(ide: unknown): Promise<void> {
  assertVsCode(ide)
  invalidateWindowCache()
  if (process.platform === 'darwin') {
    await quitApp(VSCODE_BUNDLE_ID, 'VS Code')
    return
  }
  const main = await findRunningMain()
  if (!main) throw new Error('VS Code is not running.')
  if (process.platform === 'win32') {
    // Without /F this posts WM_CLOSE, so VS Code runs its own shutdown and save prompts.
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
