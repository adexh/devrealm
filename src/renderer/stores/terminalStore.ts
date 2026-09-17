import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TerminalSessionInfo } from '../../shared/terminal'
import { useWorkspaceStore } from './workspaceStore'
import type { DrawerFilter, SessionStat, TerminalSession } from '../features/terminals/types'
import * as terminalsIpc from '../features/terminals/ipc/terminals'

type OpenSessionInput = {
  workspaceId: string
  repoId: string | null
  repoName: string
  cwd: string
}

interface TerminalState {
  sessions: TerminalSession[]
  /** The workspace the whole screen is scoped to. Null means nothing picked yet. */
  activeWorkspaceId: string | null
  activeSessionId: string | null
  /** Sessions shown side by side, left to right. One entry, or two when split. */
  paneIds: string[]
  /** A second pane exists but has no session yet, so it shows the chooser. */
  pendingPane: boolean
  error: string | null
  ready: boolean

  railOpen: boolean
  drawerOpen: boolean
  /** Hides both drawers to give the terminal the whole window. */
  maximized: boolean
  /** Width of the left pane when split, as a fraction. */
  splitRatio: number
  drawerQuery: string
  drawerFilter: DrawerFilter

  setActiveWorkspace: (workspaceId: string | null) => void
  init: () => Promise<void>
  refresh: () => Promise<void>
  openSession: (input: OpenSessionInput) => Promise<void>
  openRepoSession: (input: OpenSessionInput) => Promise<void>
  closeSession: (id: string) => Promise<void>
  focusSession: (id: string) => void
  renameSession: (id: string, title: string) => Promise<void>
  clearActiveTerminal: () => Promise<void>
  toggleSplit: () => void
  choosePaneSession: (id: string) => void
  setSplitRatio: (ratio: number) => void
  toggleMaximized: () => void
  killWorkspaceSessions: (workspaceId: string) => Promise<void>
  closeWorkspace: (workspaceId: string) => Promise<void>
  setError: (message: string | null) => void

  toggleRail: () => void
  toggleDrawer: () => void
  setDrawerQuery: (query: string) => void
  setDrawerFilter: (filter: DrawerFilter) => void
  focusAdjacentSession: (offset: 1 | -1) => void
}

function shortenHome(absolutePath: string): string {
  const match = absolutePath.match(/^\/Users\/[^/]+\/(.*)$|^\/home\/[^/]+\/(.*)$/)
  return match ? `~/${match[1] ?? match[2]}` : absolutePath
}

/**
 * Maps a daemon session onto the view model. State is derived only from facts
 * the daemon reports; richer states such as "working" arrive when the daemon
 * grows activity detection.
 */
function toViewSession(info: TerminalSessionInfo): TerminalSession {
  const workspace = useWorkspaceStore.getState().workspaces.find(item => item.id === info.workspaceId)
  const stats: SessionStat[] = [
    { label: info.shell.split('/').pop() ?? info.shell, tone: 'dim' },
    { label: `pid ${info.pid}`, tone: 'dim' },
  ]

  return {
    ...info,
    workspaceName: workspace?.name ?? 'Workspace',
    state: info.exitCode === null ? 'running' : (info.exitCode === 0 ? 'exited' : 'failed'),
    statusLabel: info.exitCode !== null && info.exitCode !== 0 ? `EXIT ${info.exitCode}` : undefined,
    subtitle: shortenHome(info.cwd),
    stats,
  }
}

/** Auto-names a tab after its repo, suffixing when the repo already has tabs. */
function nextTitle(sessions: TerminalSession[], repoName: string): string {
  const sameRepo = sessions.filter(session => session.repoName === repoName)
  return sameRepo.length === 0 ? repoName : `${repoName} ${sameRepo.length + 1}`
}

/** Set once the daemon feed is wired, so repeated init() calls do not stack listeners. */
let daemonFeed: (() => void) | null = null

function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export const useTerminalStore = create<TerminalState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeWorkspaceId: null,
      activeSessionId: null,
      paneIds: [],
      pendingPane: false,
      error: null,
      ready: false,

      railOpen: true,
      drawerOpen: true,
      maximized: false,
      splitRatio: 0.5,
      drawerQuery: '',
      drawerFilter: 'all',

      setActiveWorkspace: (workspaceId) => {
        const { activeSessionId, sessions } = get()
        const active = sessions.find(session => session.id === activeSessionId)
        // Focus follows the workspace: a session in another one is not visible
        // from here, so holding it selected would be a lie.
        const keep = active && active.workspaceId === workspaceId ? activeSessionId : null
        set({
          activeWorkspaceId: workspaceId,
          activeSessionId: keep,
          paneIds: keep ? [keep] : [],
          pendingPane: false,
          drawerQuery: '',
        })
      },

      init: async () => {
        // The daemon may already hold sessions from before this window opened,
        // which is the whole point of it outliving the app. init() runs on every
        // mount of the terminals screen and on the first launch from elsewhere,
        // so the subscription is taken once and kept for the window's life.
        daemonFeed ??= terminalsIpc.onDaemonEvent(event => {
          if (event.event === 'sessions-changed') {
            set({ sessions: event.sessions.map(toViewSession) })
          }
        })
        await get().refresh()
        set({ ready: true })
      },

      refresh: async () => {
        try {
          const sessions = (await terminalsIpc.listSessions()).map(toViewSession)
          const { activeSessionId, activeWorkspaceId } = get()

          // A persisted workspace may have been removed since last run.
          const knownWorkspaces = useWorkspaceStore.getState().workspaces
          const workspaceStillExists = knownWorkspaces.some(item => item.id === activeWorkspaceId)
          const workspaceId = workspaceStillExists ? activeWorkspaceId : null

          const inScope = sessions.filter(session => session.workspaceId === workspaceId)
          const nextActive = inScope.some(session => session.id === activeSessionId)
            ? activeSessionId
            : (inScope[inScope.length - 1]?.id ?? null)
          const live = new Set(inScope.map(session => session.id))
          const panes = get().paneIds.filter(id => live.has(id))
          set({
            sessions,
            error: null,
            activeWorkspaceId: workspaceId,
            activeSessionId: nextActive,
            paneIds: panes.length > 0 ? panes : (nextActive ? [nextActive] : []),
            pendingPane: get().pendingPane && panes.length === 1,
          })
        } catch (error) {
          set({ error: message(error, 'Could not reach the terminal daemon') })
        }
      },

      openSession: async (input) => {
        try {
          const info = await terminalsIpc.openSession({
            workspaceId: input.workspaceId,
            repoId: input.repoId,
            repoName: input.repoName,
            title: nextTitle(get().sessions, input.repoName),
            cwd: input.cwd,
            cols: 80,
            rows: 24,
          })
          const { pendingPane, paneIds } = get()
          set({
            activeWorkspaceId: input.workspaceId,
            activeSessionId: info.id,
            paneIds: pendingPane && paneIds.length === 1 ? [...paneIds, info.id] : [info.id],
            pendingPane: false,
            error: null,
          })
          await get().refresh()
        } catch (error) {
          set({ error: message(error, 'Could not start a shell') })
        }
      },

      /**
       * Launching from outside the terminals screen, where the caller only knows
       * a repo: reuse that repo's newest shell if one is already running, else
       * start one. Listing first matters because the daemon can hold shells this
       * window has never seen.
       */
      openRepoSession: async (input) => {
        if (!get().ready) await get().init()
        const running = get().sessions.filter(session =>
          session.workspaceId === input.workspaceId &&
          session.repoId === input.repoId &&
          // An exited shell still has a tab, but reusing it would drop the user
          // into a dead terminal instead of starting work.
          session.exitCode === null
        )
        const newest = running[running.length - 1]
        if (!newest) {
          await get().openSession(input)
          return
        }
        set({
          activeWorkspaceId: newest.workspaceId,
          activeSessionId: newest.id,
          paneIds: [newest.id],
          error: null,
        })
      },

      closeSession: async (id) => {
        const { sessions, activeSessionId, activeWorkspaceId } = get()
        const remaining = sessions.filter(session => session.id !== id)
        // Successor must come from the visible workspace, not any session.
        const inScope = remaining.filter(session => session.workspaceId === activeWorkspaceId)
        const scopeIndex = sessions
          .filter(session => session.workspaceId === activeWorkspaceId)
          .findIndex(session => session.id === id)
        const nextActive = activeSessionId === id
          ? (inScope[scopeIndex]?.id ?? inScope[scopeIndex - 1]?.id ?? inScope[inScope.length - 1]?.id ?? null)
          : activeSessionId
        const panes = get().paneIds.filter(paneId => paneId !== id)
        set({
          sessions: remaining,
          activeSessionId: nextActive,
          paneIds: panes.length > 0 ? panes : (nextActive ? [nextActive] : []),
          pendingPane: get().pendingPane && panes.length === 1,
        })
        try {
          await terminalsIpc.closeSession(id)
        } catch (error) {
          // The optimistic removal above already took the tab away. If the
          // daemon refused, the pty is still running and unreachable, so put
          // the truth back rather than leave the user without it.
          set({ error: message(error, 'Could not close the shell') })
          await get().refresh()
        }
      },

      /**
       * Picking a session from the rail or the tab bar replaces whichever pane
       * has focus, so a split stays split instead of collapsing on every click.
       */
      focusSession: (id) => {
        const { paneIds, activeSessionId } = get()
        if (paneIds.includes(id)) {
          set({ activeSessionId: id })
          return
        }
        const focusedIndex = Math.max(0, paneIds.indexOf(activeSessionId ?? ''))
        const next = paneIds.length > 0 ? [...paneIds] : [id]
        if (paneIds.length > 0) next[focusedIndex] = id
        set({ activeSessionId: id, paneIds: next })
      },

      clearActiveTerminal: async () => {
        const { activeSessionId } = get()
        if (!activeSessionId) return
        try {
          await terminalsIpc.clearSession(activeSessionId)
        } catch (error) {
          set({ error: message(error, 'Could not clear the terminal') })
        }
      },

      /**
       * Opens a second pane without deciding what goes in it. The pane shows a
       * chooser, because splitting to an unwanted new shell is worse than one
       * extra click, and an existing session is often what you want beside the
       * current one.
       *
       * Toggling off only unsplits the view. Killing a shell from what reads as
       * a layout control would be a nasty surprise, so the session stays in the
       * tab bar.
       */
      toggleSplit: () => {
        const { paneIds, activeSessionId, pendingPane } = get()
        if (paneIds.length > 1) {
          const keep = activeSessionId && paneIds.includes(activeSessionId) ? activeSessionId : paneIds[0]
          set({ paneIds: [keep], activeSessionId: keep, pendingPane: false })
          return
        }
        if (pendingPane) {
          set({ pendingPane: false })
          return
        }
        if (paneIds.length === 1) set({ pendingPane: true })
      },

      choosePaneSession: (id) => {
        const { paneIds, pendingPane } = get()
        if (!pendingPane || paneIds.includes(id)) return
        set({ paneIds: [...paneIds, id], pendingPane: false, activeSessionId: id })
      },

      setSplitRatio: (ratio) => set({ splitRatio: Math.min(0.8, Math.max(0.2, ratio)) }),

      toggleMaximized: () => set({ maximized: !get().maximized }),

      renameSession: async (id, title) => {
        const trimmed = title.trim()
        if (!trimmed) return
        set({
          sessions: get().sessions.map(session =>
            session.id === id ? { ...session, title: trimmed } : session
          ),
        })
        try {
          await terminalsIpc.renameSession(id, trimmed)
        } catch (error) {
          set({ error: message(error, 'Could not rename the tab') })
        }
      },

      /** Kills every shell in a workspace but stays in it, now empty. */
      killWorkspaceSessions: async (workspaceId) => {
        const doomed = get().sessions.filter(session => session.workspaceId === workspaceId)
        for (const session of doomed) await get().closeSession(session.id)
      },

      /**
       * Closing a workspace tab: kill its shells and move somewhere else.
       * Distinct from killWorkspaceSessions, which leaves you where you are.
       */
      closeWorkspace: async (workspaceId) => {
        await get().killWorkspaceSessions(workspaceId)
        if (get().activeWorkspaceId !== workspaceId) return

        // Fall through to another workspace that still has shells, else the picker.
        const next = get().sessions.find(session => session.workspaceId !== workspaceId)
        get().setActiveWorkspace(next?.workspaceId ?? null)
      },

      setError: (message) => set({ error: message }),

      toggleRail: () => set({ railOpen: !get().railOpen, maximized: false }),
      toggleDrawer: () => set({ drawerOpen: !get().drawerOpen, maximized: false }),

      setDrawerQuery: (query) => set({ drawerQuery: query }),
      setDrawerFilter: (filter) => set({ drawerFilter: filter }),

      focusAdjacentSession: (offset) => {
        const { sessions, activeSessionId, activeWorkspaceId } = get()
        const siblings = sessions.filter(session => session.workspaceId === activeWorkspaceId)
        const index = siblings.findIndex(session => session.id === activeSessionId)
        if (index === -1) return
        const next = siblings[(index + offset + siblings.length) % siblings.length]
        if (next) get().focusSession(next.id)
      },
    }),
    {
      name: 'terminal-ui',
      partialize: (state) => ({
        railOpen: state.railOpen,
        drawerOpen: state.drawerOpen,
        activeWorkspaceId: state.activeWorkspaceId,
        splitRatio: state.splitRatio,
      }),
    }
  )
)
