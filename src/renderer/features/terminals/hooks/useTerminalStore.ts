import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TerminalSessionInfo } from '../../../../shared/terminal'
import { useWorkspaceStore } from '../../../stores/workspaceStore'
import type { DrawerFilter, SessionGroup, SessionStat, TerminalSession } from '../types'
import * as terminalsIpc from '../ipc/terminals'

type OpenSessionInput = {
  workspaceId: string
  repoId: string | null
  repoName: string
  cwd: string
}

interface TerminalState {
  sessions: TerminalSession[]
  activeSessionId: string | null
  error: string | null
  ready: boolean

  railOpen: boolean
  drawerOpen: boolean
  collapsedGroupIds: string[]
  drawerQuery: string
  drawerFilter: DrawerFilter

  init: () => Promise<void>
  refresh: () => Promise<void>
  openSession: (input: OpenSessionInput) => Promise<void>
  closeSession: (id: string) => Promise<void>
  focusSession: (id: string) => void
  renameSession: (id: string, title: string) => Promise<void>
  killWorkspaceSessions: (workspaceId: string) => Promise<void>
  setError: (message: string | null) => void

  toggleRail: () => void
  toggleDrawer: () => void
  toggleGroup: (workspaceId: string) => void
  collapseAllGroups: () => void
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
      activeSessionId: null,
      error: null,
      ready: false,

      railOpen: true,
      drawerOpen: true,
      collapsedGroupIds: [],
      drawerQuery: '',
      drawerFilter: 'all',

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
          const active = get().activeSessionId
          set({
            sessions,
            error: null,
            activeSessionId: sessions.some(session => session.id === active)
              ? active
              : (sessions[sessions.length - 1]?.id ?? null),
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
          set({ activeSessionId: info.id, error: null })
          await get().refresh()
        } catch (error) {
          set({ error: message(error, 'Could not start a shell') })
        }
      },

      closeSession: async (id) => {
        const { sessions, activeSessionId } = get()
        const index = sessions.findIndex(session => session.id === id)
        const remaining = sessions.filter(session => session.id !== id)
        set({
          sessions: remaining,
          activeSessionId: activeSessionId === id
            ? (remaining[index]?.id ?? remaining[index - 1]?.id ?? remaining[remaining.length - 1]?.id ?? null)
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

      killWorkspaceSessions: async (workspaceId) => {
        const doomed = get().sessions.filter(session => session.workspaceId === workspaceId)
        for (const session of doomed) await get().closeSession(session.id)
      },

      setError: (message) => set({ error: message }),

      toggleRail: () => set({ railOpen: !get().railOpen }),
      toggleDrawer: () => set({ drawerOpen: !get().drawerOpen }),

      toggleGroup: (workspaceId) => {
        const { collapsedGroupIds } = get()
        set({
          collapsedGroupIds: collapsedGroupIds.includes(workspaceId)
            ? collapsedGroupIds.filter(id => id !== workspaceId)
            : [...collapsedGroupIds, workspaceId],
        })
      },

      collapseAllGroups: () => {
        const { sessions, collapsedGroupIds } = get()
        const allIds = [...new Set(sessions.map(session => session.workspaceId))]
        set({ collapsedGroupIds: collapsedGroupIds.length === allIds.length ? [] : allIds })
      },

      setDrawerQuery: (query) => set({ drawerQuery: query }),
      setDrawerFilter: (filter) => set({ drawerFilter: filter }),

      focusAdjacentSession: (offset) => {
        const { sessions, activeSessionId } = get()
        const active = sessions.find(session => session.id === activeSessionId)
        if (!active) return
        const siblings = sessions.filter(session => session.workspaceId === active.workspaceId)
        const index = siblings.findIndex(session => session.id === active.id)
        const next = siblings[(index + offset + siblings.length) % siblings.length]
        if (next) set({ activeSessionId: next.id })
      },
    }),
    {
      name: 'terminal-ui',
      partialize: (state) => ({
        railOpen: state.railOpen,
        drawerOpen: state.drawerOpen,
        collapsedGroupIds: state.collapsedGroupIds,
      }),
    }
  )
)

/** Buckets sessions by workspace. A group exists only because a tab opened in it. */
export function groupSessions(sessions: TerminalSession[]): SessionGroup[] {
  const groups: SessionGroup[] = []
  for (const session of sessions) {
    const existing = groups.find(group => group.workspaceId === session.workspaceId)
    if (existing) {
      existing.sessions.push(session)
      continue
    }
    groups.push({
      workspaceId: session.workspaceId,
      workspaceName: session.workspaceName,
      sessions: [session],
    })
  }
  return groups
}
