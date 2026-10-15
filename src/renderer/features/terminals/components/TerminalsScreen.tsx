import { Fragment, useCallback, useEffect, useRef } from 'react'
import { useUiStore } from '../../../stores/uiStore'
import { useTerminalStore } from '../../../stores/terminalStore'
import { useTerminalShortcuts } from '../hooks/useTerminalShortcuts'
import { DRAWER_WIDTH, HOME_WORKSPACE_ID, RAIL_WIDTH } from '../constants'
import type { LaunchTarget } from '../types'
import { RepoLauncherDrawer } from './RepoLauncherDrawer'
import { SessionRail } from './SessionRail'
import { TerminalContextBar } from './TerminalContextBar'
import { TerminalEmptyState } from './TerminalEmptyState'
import { TerminalShortcutBar } from './TerminalShortcutBar'
import { TerminalSurface } from './TerminalSurface'
import { TerminalPaneChooser } from './TerminalPaneChooser'
import { ResizeHandle } from './ResizeHandle'
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
  const openHomeSession = useTerminalStore(state => state.openHomeSession)
  const paneIds = useTerminalStore(state => state.paneIds)
  const maximized = useTerminalStore(state => state.maximized)
  const pendingPane = useTerminalStore(state => state.pendingPane)
  const splitRatio = useTerminalStore(state => state.splitRatio)
  const setSplitRatio = useTerminalStore(state => state.setSplitRatio)
  const setRailWidth = useTerminalStore(state => state.setRailWidth)
  const setDrawerWidth = useTerminalStore(state => state.setDrawerWidth)
  const panesRef = useRef<HTMLDivElement>(null)
  const columnsRef = useRef<HTMLDivElement>(null)

  // The daemon may already hold sessions from before this window opened.
  useEffect(() => { void init() }, [init])

  const activeSession = sessions.find(session => session.id === activeSessionId) ?? null
  // The tab bar, like everything else here, shows only the selected workspace.
  const scopedSessions = sessions.filter(session => session.workspaceId === activeWorkspaceId)
  const paneSessions = paneIds
    .map(id => sessions.find(session => session.id === id))
    .filter((session): session is NonNullable<typeof session> => Boolean(session))

  // A waiting pane counts towards the layout, so the split shows up the moment
  // you ask for it rather than when a session lands in it.
  const splitCount = paneSessions.length + (pendingPane ? 1 : 0)
  const paneBasis = (index: number) =>
    splitCount < 2 ? 1 : (index === 0 ? splitRatio : 1 - splitRatio)

  const resizeRail = useCallback((clientX: number) => {
    const rect = columnsRef.current?.getBoundingClientRect()
    if (!rect) return
    setRailWidth(Number.isNaN(clientX) ? RAIL_WIDTH.default : clientX - rect.left)
  }, [setRailWidth])

  const resizeDrawer = useCallback((clientX: number) => {
    const rect = columnsRef.current?.getBoundingClientRect()
    if (!rect) return
    setDrawerWidth(Number.isNaN(clientX) ? DRAWER_WIDTH.default : rect.right - clientX)
  }, [setDrawerWidth])

  /** Pointer x to a fraction of the pane row; NaN from a double click resets it. */
  const resizePanes = useCallback((clientX: number) => {
    const rect = panesRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    setSplitRatio(Number.isNaN(clientX) ? 0.5 : (clientX - rect.left) / rect.width)
  }, [setSplitRatio])

  const launch = useCallback((target: LaunchTarget) => {
    void openSession({
      workspaceId: target.workspaceId,
      repoId: target.id,
      repoName: target.name,
      cwd: target.path,
    })
  }, [openSession])

  /** New Shell: another in the current repo, else the launcher, else home. */
  const newShell = useCallback(() => {
    if (!activeWorkspaceId || activeWorkspaceId === HOME_WORKSPACE_ID) {
      void openHomeSession()
      return
    }
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
  }, [activeWorkspaceId, activeSession, drawerOpen, toggleDrawer, openSession, openHomeSession])

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

      <div ref={columnsRef} className="flex-1 min-h-0 flex w-full overflow-hidden">
        {railOpen && !maximized && (
          <>
            <SessionRail onQuickSwitch={openGlobalSearch} />
            <ResizeHandle onDrag={resizeRail} />
          </>
        )}

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
              {/* Keyed by id: switching tabs disposes that xterm and mounts a
                  fresh one that replays the daemon's snapshot. */}
              <div ref={panesRef} className="flex-1 min-h-0 flex">
                {paneSessions.map((session, index) => (
                  <Fragment key={session.id}>
                    {index > 0 && <ResizeHandle onDrag={resizePanes} />}
                    <div
                      onMouseDownCapture={() => focusSession(session.id)}
                      style={{ flexBasis: `${paneBasis(index) * 100}%` }}
                      className={splitCount > 1 && session.id === activeSessionId
                        ? 'min-w-0 flex flex-col border-t-2 border-tm-ok'
                        : 'min-w-0 flex flex-col border-t-2 border-transparent'}
                    >
                      <TerminalSurface session={session} />
                    </div>
                  </Fragment>
                ))}

                {pendingPane && (
                  <>
                    <ResizeHandle onDrag={resizePanes} />
                    <div
                      style={{ flexBasis: `${(1 - splitRatio) * 100}%` }}
                      className="min-w-0 flex flex-col border-t-2 border-transparent"
                    >
                      <TerminalPaneChooser />
                    </div>
                  </>
                )}
              </div>
              <TerminalShortcutBar boundPort={activeSession.boundPort} />
            </>
          ) : (
            <TerminalEmptyState onOpenDrawer={() => { if (!drawerOpen) toggleDrawer() }} />
          )}
        </main>

        {drawerOpen && !maximized && (
          <>
            <ResizeHandle onDrag={resizeDrawer} />
            <RepoLauncherDrawer onLaunch={launch} />
          </>
        )}
      </div>
    </div>
  )
}
