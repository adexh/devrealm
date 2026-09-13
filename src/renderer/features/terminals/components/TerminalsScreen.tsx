import { useCallback } from 'react'
import { useWorkspaceStore } from '../../../stores/workspaceStore'
import { useUiStore } from '../../../stores/uiStore'
import { useTerminalStore } from '../hooks/useTerminalStore'
import { useTerminalShortcuts } from '../hooks/useTerminalShortcuts'
import type { LaunchTarget } from '../types'
import { RepoLauncherDrawer } from './RepoLauncherDrawer'
import { SessionRail } from './SessionRail'
import { TerminalContextBar } from './TerminalContextBar'
import { TerminalEmptyState } from './TerminalEmptyState'
import { TerminalShortcutBar } from './TerminalShortcutBar'
import { TerminalSurface } from './TerminalSurface'
import { TerminalTabBar } from './TerminalTabBar'

export function TerminalsScreen() {
  const workspaces = useWorkspaceStore(state => state.workspaces)
  const openGlobalSearch = useUiStore(state => state.openGlobalSearch)

  const sessions = useTerminalStore(state => state.sessions)
  const activeSessionId = useTerminalStore(state => state.activeSessionId)
  const railOpen = useTerminalStore(state => state.railOpen)
  const drawerOpen = useTerminalStore(state => state.drawerOpen)
  const openSession = useTerminalStore(state => state.openSession)
  const closeSession = useTerminalStore(state => state.closeSession)
  const focusSession = useTerminalStore(state => state.focusSession)
  const toggleDrawer = useTerminalStore(state => state.toggleDrawer)

  const activeSession = sessions.find(session => session.id === activeSessionId) ?? null

  // The centre tab bar shows only the active group's tabs. Switching groups is
  // the left rail's job, which keeps the bar short with many shells open.
  const groupSessionsForActive = activeSession
    ? sessions.filter(session => session.workspaceId === activeSession.workspaceId)
    : []

  const launch = useCallback((target: LaunchTarget) => {
    const workspace = workspaces.find(item => item.id === target.workspaceId)
    openSession({
      workspaceId: target.workspaceId,
      workspaceName: workspace?.name ?? 'Workspace',
      repoId: target.id,
      repoName: target.name,
      cwd: target.path,
    })
  }, [workspaces, openSession])

  /** ⌘T and New Shell: another shell in the current repo, else open the launcher. */
  const newShell = useCallback(() => {
    if (!activeSession) {
      if (!drawerOpen) toggleDrawer()
      return
    }
    openSession({
      workspaceId: activeSession.workspaceId,
      workspaceName: activeSession.workspaceName,
      repoId: activeSession.repoId,
      repoName: activeSession.repoName,
      cwd: activeSession.cwd,
    })
  }, [activeSession, drawerOpen, toggleDrawer, openSession])

  useTerminalShortcuts(newShell)

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-tm-bg">
      <TerminalContextBar onNewShell={newShell} />

      <div className="flex-1 min-h-0 flex w-full overflow-hidden">
        {railOpen && <SessionRail onQuickSwitch={openGlobalSearch} />}

        <main className="flex-1 flex flex-col min-w-0 bg-tm-0 overflow-hidden">
          {activeSession ? (
            <>
              <TerminalTabBar
                sessions={groupSessionsForActive}
                activeSessionId={activeSessionId}
                activeSession={activeSession}
                onFocus={focusSession}
                onClose={closeSession}
                onNewTab={newShell}
              />
              <TerminalSurface session={activeSession} />
              <TerminalShortcutBar boundPort={activeSession.boundPort} />
            </>
          ) : (
            <TerminalEmptyState onOpenDrawer={() => { if (!drawerOpen) toggleDrawer() }} />
          )}
        </main>

        {drawerOpen && <RepoLauncherDrawer onLaunch={launch} />}
      </div>
    </div>
  )
}
