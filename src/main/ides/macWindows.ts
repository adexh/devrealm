import { execFile } from 'child_process'
import { systemPreferences } from 'electron'

const SCRIPT_TIMEOUT_MS = 15_000

export function isAccessibilityGranted(prompt: boolean): boolean {
  if (process.platform !== 'darwin') return false
  return systemPreferences.isTrustedAccessibilityClient(prompt)
}

/**
 * Two consents are involved and their failures read differently. Automation is
 * per target app and macOS prompts for it on first use; Accessibility is the
 * one the banner in the UI asks for.
 */
function describeAppleScriptError(text: string, target: string): string {
  if (text.includes('-1743')) {
    return `DevRealm is not allowed to control ${target}. Allow it under System Settings > Privacy & Security > Automation.`
  }
  if (text.includes('assistive access') || text.includes('-25211')) {
    return 'DevRealm needs Accessibility permission to see VS Code windows.'
  }
  if (text.includes('-1728')) {
    return 'That VS Code window is no longer open.'
  }
  return text.replace(/^\d+:\d+:\s*execution error:\s*/, '').trim() || 'AppleScript failed'
}

/** `target` is the app the script talks to, named in the Automation error so the user knows which toggle to flip. */
function runAppleScript(script: string, target: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script], { timeout: SCRIPT_TIMEOUT_MS }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(describeAppleScriptError(stderr || error.message, target)))
        return
      }
      resolve(stdout.replace(/\n$/, ''))
    })
  })
}

function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

export async function listWindowTitles(bundleId: string): Promise<string[]> {
  const output = await runAppleScript(`
tell application "System Events"
  set titles to {}
  repeat with proc in (every process whose bundle identifier is ${quote(bundleId)})
    repeat with win in (every window of proc)
      try
        set winName to name of win
        if winName is not missing value and winName is not "" then set end of titles to winName
      end try
    end repeat
  end repeat
  set AppleScript's text item delimiters to linefeed
  return titles as text
end tell`, 'System Events')
  return output.split('\n').filter(Boolean)
}

/**
 * Looks the window up by title at click time rather than trusting an index
 * from the last poll: titles change with the active editor, and acting on the
 * wrong window is worse than reporting that this one is gone.
 */
export async function raiseWindow(bundleId: string, title: string): Promise<void> {
  const result = await runAppleScript(`
tell application "System Events"
  repeat with proc in (every process whose bundle identifier is ${quote(bundleId)})
    set matches to (every window of proc whose name is ${quote(title)})
    if (count of matches) > 0 then
      perform action "AXRaise" of item 1 of matches
      set frontmost of proc to true
      return "ok"
    end if
  end repeat
  return "missing"
end tell`, 'System Events')
  if (result !== 'ok') throw new Error('That VS Code window is no longer open.')
}

/**
 * Clicks the window's own close button, so VS Code runs its save prompt and
 * nothing is killed. The window is raised first so that prompt is visible.
 */
export async function closeWindow(bundleId: string, title: string): Promise<void> {
  const result = await runAppleScript(`
tell application "System Events"
  repeat with proc in (every process whose bundle identifier is ${quote(bundleId)})
    set matches to (every window of proc whose name is ${quote(title)})
    if (count of matches) > 0 then
      set win to item 1 of matches
      perform action "AXRaise" of win
      set frontmost of proc to true
      set closeButtons to (every button of win whose subrole is "AXCloseButton")
      if (count of closeButtons) > 0 then
        click item 1 of closeButtons
        return "ok"
      end if
      return "no-button"
    end if
  end repeat
  return "missing"
end tell`, 'System Events')
  if (result === 'missing') throw new Error('That VS Code window is no longer open.')
  if (result !== 'ok') throw new Error('The window has no close button DevRealm can reach.')
}

export async function quitApp(bundleId: string, label: string): Promise<void> {
  await runAppleScript(`tell application id ${quote(bundleId)} to quit`, label)
}
