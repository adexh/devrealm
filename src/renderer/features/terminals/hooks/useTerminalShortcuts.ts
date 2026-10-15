import { useEffect } from 'react'
import { useTerminalStore } from '../../../stores/terminalStore'

/**
 * Terminal-screen keyboard shortcuts. Mounted only while the Terminals screen
 * is visible so it never competes with the app's global bindings.
 */
export function useTerminalShortcuts(onNewShell: () => void): void {
  const toggleRail = useTerminalStore(state => state.toggleRail)
  const toggleDrawer = useTerminalStore(state => state.toggleDrawer)
  const focusAdjacentSession = useTerminalStore(state => state.focusAdjacentSession)
  const toggleSplit = useTerminalStore(state => state.toggleSplit)
  const toggleMaximized = useTerminalStore(state => state.toggleMaximized)

  useEffect(() => {
    // Captured before xterm sees the key: xterm turns Alt+arrows into escape
    // sequences for the shell and stops them there, so ⌥↑ / ⌥↓ never bubbled up.
    function claim(event: KeyboardEvent) {
      event.preventDefault()
      event.stopPropagation()
    }

    function onKey(event: KeyboardEvent) {
      // Only the platform's own modifier. Accepting ctrl as well claimed Ctrl+B
      // and Ctrl+T on macOS, which xterm has already handed to the pty, so
      // readline moved the cursor and the drawer toggled on the same keypress.
      const mod = window.electronAPI.platform === 'darwin' ? event.metaKey : event.ctrlKey
      if (mod && event.key === '1') {
        claim(event)
        toggleRail()
        return
      }
      if (mod && event.key.toLowerCase() === 'b') {
        claim(event)
        toggleDrawer()
        return
      }
      if (mod && event.key.toLowerCase() === 't') {
        claim(event)
        onNewShell()
        return
      }
      if (mod && event.key === '\\') {
        claim(event)
        toggleSplit()
        return
      }
      // Escape only leaves maximized; it must stay available to the shell.
      if (event.key === 'Escape' && useTerminalStore.getState().maximized) {
        claim(event)
        toggleMaximized()
        return
      }
      if (event.altKey && event.key === 'ArrowUp') {
        claim(event)
        focusAdjacentSession(-1)
        return
      }
      if (event.altKey && event.key === 'ArrowDown') {
        claim(event)
        focusAdjacentSession(1)
      }
    }

    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [toggleRail, toggleDrawer, focusAdjacentSession, toggleSplit, toggleMaximized, onNewShell])
}
