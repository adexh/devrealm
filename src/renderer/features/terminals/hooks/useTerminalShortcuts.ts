import { useEffect } from 'react'
import { useTerminalStore } from './useTerminalStore'

/**
 * Terminal-screen keyboard shortcuts. Mounted only while the Terminals screen
 * is visible so it never competes with the app's global bindings.
 */
export function useTerminalShortcuts(onNewShell: () => void): void {
  const toggleRail = useTerminalStore(state => state.toggleRail)
  const toggleDrawer = useTerminalStore(state => state.toggleDrawer)
  const focusAdjacentSession = useTerminalStore(state => state.focusAdjacentSession)

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const mod = event.metaKey || event.ctrlKey
      if (mod && event.key === '1') {
        event.preventDefault()
        toggleRail()
        return
      }
      if (mod && event.key.toLowerCase() === 'b') {
        event.preventDefault()
        toggleDrawer()
        return
      }
      if (mod && event.key.toLowerCase() === 't') {
        event.preventDefault()
        onNewShell()
        return
      }
      if (event.altKey && event.key === 'ArrowUp') {
        event.preventDefault()
        focusAdjacentSession(-1)
        return
      }
      if (event.altKey && event.key === 'ArrowDown') {
        event.preventDefault()
        focusAdjacentSession(1)
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleRail, toggleDrawer, focusAdjacentSession, onNewShell])
}
