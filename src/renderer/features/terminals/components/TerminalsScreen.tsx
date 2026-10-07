import { useCallback, useEffect, useRef } from 'react'
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
import { PaneGrid } from './PaneGrid'
import { ResizeHandle } from './ResizeHandle'
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
  const toggleDrawer = useTerminalStore(state => state.toggleDrawer)
  const openHomeSession = useTerminalStore(state => state.openHomeSession)
  const maximized = useTerminalStore(state => state.maximized)
  const setRailWidth = useTerminalStore(state => state.setRailWidth)
  const setDrawerWidth = useTerminalStore(state => state.setDrawerWidth)
  const columnsRef = useRef<HTMLDivElement>(null)

  // The daemon may already hold sessions from before this window opened.
  useEffect(() => { void init() }, [init])

  const activeSession = sessions.find(session => session.id === activeSessionId) ?? null

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
              <PaneGrid onNewShell={newShell} />
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
