import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TerminalSessionInfo } from '../../../../shared/terminal'
import { useWorkspaceStore } from '../../../stores/workspaceStore'
import type { DrawerFilter, SessionStat, TerminalSession } from '../types'
import * as terminalsIpc from '../ipc/terminals'

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
  error: string | null
  ready: boolean

  railOpen: boolean
  drawerOpen: boolean
  drawerQuery: string
  drawerFilter: DrawerFilter

  setActiveWorkspace: (workspaceId: string | null) => void
  init: () => Promise<void>
  refresh: () => Promise<void>
  openSession: (input: OpenSessionInput) => Promise<void>
  closeSession: (id: string) => Promise<void>
  focusSession: (id: string) => void
  renameSession: (id: string, title: string) => Promise<void>
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

function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export const useTerminalStore = create<TerminalState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeWorkspaceId: null,
      activeSessionId: null,
      error: null,
      ready: false,

      railOpen: true,
      drawerOpen: true,
      drawerQuery: '',
      drawerFilter: 'all',

      setActiveWorkspace: (workspaceId) => {
        const { activeSessionId, sessions } = get()
        const active = sessions.find(session => session.id === activeSessionId)
        // Focus follows the workspace: a session in another one is not visible
        // from here, so holding it selected would be a lie.
        set({
          activeWorkspaceId: workspaceId,
          activeSessionId: active && active.workspaceId === workspaceId ? activeSessionId : null,
          drawerQuery: '',
        })
      },

      init: async () => {
        // The daemon may already hold sessions from before this window opened,
        // which is the whole point of it outliving the app.
        terminalsIpc.onDaemonEvent(event => {
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
          set({
            sessions,
            error: null,
            activeWorkspaceId: workspaceId,
            activeSessionId: inScope.some(session => session.id === activeSessionId)
              ? activeSessionId
              : (inScope[inScope.length - 1]?.id ?? null),
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
          set({ activeWorkspaceId: input.workspaceId, activeSessionId: info.id, error: null })
          await get().refresh()
        } catch (error) {
          set({ error: message(error, 'Could not start a shell') })
        }
      },

      closeSession: async (id) => {
        const { sessions, activeSessionId, activeWorkspaceId } = get()
        const remaining = sessions.filter(session => session.id !== id)
        // Successor must come from the visible workspace, not any session.
        const inScope = remaining.filter(session => session.workspaceId === activeWorkspaceId)
        const scopeIndex = sessions
          .filter(session => session.workspaceId === activeWorkspaceId)
          .findIndex(session => session.id === id)
        set({
          sessions: remaining,
          activeSessionId: activeSessionId === id
            ? (inScope[scopeIndex]?.id ?? inScope[scopeIndex - 1]?.id ?? inScope[inScope.length - 1]?.id ?? null)
            : activeSessionId,
        })
        try {
          await terminalsIpc.closeSession(id)
        } catch (error) {
          set({ error: message(error, 'Could not close the shell') })
        }
      },

      focusSession: (id) => set({ activeSessionId: id }),

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

      toggleRail: () => set({ railOpen: !get().railOpen }),
      toggleDrawer: () => set({ drawerOpen: !get().drawerOpen }),

      setDrawerQuery: (query) => set({ drawerQuery: query }),
      setDrawerFilter: (filter) => set({ drawerFilter: filter }),

      focusAdjacentSession: (offset) => {
        const { sessions, activeSessionId, activeWorkspaceId } = get()
        const siblings = sessions.filter(session => session.workspaceId === activeWorkspaceId)
        const index = siblings.findIndex(session => session.id === activeSessionId)
        if (index === -1) return
        const next = siblings[(index + offset + siblings.length) % siblings.length]
        if (next) set({ activeSessionId: next.id })
      },
    }),
    {
      name: 'terminal-ui',
      partialize: (state) => ({
        railOpen: state.railOpen,
        drawerOpen: state.drawerOpen,
        activeWorkspaceId: state.activeWorkspaceId,
      }),
    }
  )
)
