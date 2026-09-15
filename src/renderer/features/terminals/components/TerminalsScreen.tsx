import { useCallback, useEffect } from 'react'
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
import { WorkspacePicker } from './WorkspacePicker'

export function TerminalsScreen() {
  const openGlobalSearch = useUiStore(state => state.openGlobalSearch)

  const sessions = useTerminalStore(state => state.sessions)
  const activeWorkspaceId = useTerminalStore(state => state.activeWorkspaceId)
  const activeSessionId = useTerminalStore(state => state.activeSessionId)
  const railOpen = useTerminalStore(state => state.railOpen)
  const drawerOpen = useTerminalStore(state => state.drawerOpen)
  const error = useTerminalStore(state => state.error)
  const init = useTerminalStore(state => state.init)
  const setError = useTerminalStore(state => state.setError)
  const openSession = useTerminalStore(state => state.openSession)
  const closeSession = useTerminalStore(state => state.closeSession)
  const focusSession = useTerminalStore(state => state.focusSession)
  const toggleDrawer = useTerminalStore(state => state.toggleDrawer)

  // The daemon may already hold sessions from before this window opened.
  useEffect(() => { void init() }, [init])

  const activeSession = sessions.find(session => session.id === activeSessionId) ?? null
  // The tab bar, like everything else here, shows only the selected workspace.
  const scopedSessions = sessions.filter(session => session.workspaceId === activeWorkspaceId)

  const launch = useCallback((target: LaunchTarget) => {
    void openSession({
      workspaceId: target.workspaceId,
      repoId: target.id,
      repoName: target.name,
      cwd: target.path,
    })
  }, [openSession])

  /** New Shell: another shell in the current repo, else open the launcher. */
  const newShell = useCallback(() => {
    if (!activeWorkspaceId) return
    if (!activeSession) {
      if (!drawerOpen) toggleDrawer()
      return
    }
    void openSession({
      workspaceId: activeSession.workspaceId,
      repoId: activeSession.repoId,
      repoName: activeSession.repoName,
      cwd: activeSession.cwd,
    })
  }, [activeWorkspaceId, activeSession, drawerOpen, toggleDrawer, openSession])

  useTerminalShortcuts(newShell)

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-tm-bg">
      <TerminalContextBar onNewShell={newShell} />

      {error && (
        <div className="px-3 py-1.5 bg-tm-2 text-tm-err text-[12px] leading-4 flex items-center justify-between gap-3 shrink-0">
          <span className="truncate">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-tm-ink-dim hover:text-tm-ink-strong bg-transparent border-none cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 flex w-full overflow-hidden">
        {railOpen && <SessionRail onQuickSwitch={openGlobalSearch} />}

        <main className="flex-1 flex flex-col min-w-0 bg-tm-0 overflow-hidden">
          {!activeWorkspaceId ? (
            <WorkspacePicker />
          ) : activeSession ? (
            <>
              <TerminalTabBar
                sessions={scopedSessions}
                activeSessionId={activeSessionId}
                activeSession={activeSession}
                onFocus={focusSession}
                onClose={id => void closeSession(id)}
                onNewTab={newShell}
              />
              {/* Keyed by id: switching tabs disposes this xterm and mounts a
                  fresh one that replays the daemon's snapshot. */}
              <TerminalSurface key={activeSession.id} session={activeSession} />
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
