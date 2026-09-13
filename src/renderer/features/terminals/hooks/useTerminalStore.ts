import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DrawerFilter, SessionGroup, TerminalSession } from '../types'
import { DEFAULT_SHELL } from '../constants'
import { makeSessionId } from '../ipc/terminals'

type OpenSessionInput = {
  workspaceId: string
  workspaceName: string
  repoId: string | null
  repoName: string
  cwd: string
}

interface TerminalState {
  sessions: TerminalSession[]
  activeSessionId: string | null
  railOpen: boolean
  drawerOpen: boolean
  collapsedGroupIds: string[]
  drawerQuery: string
  drawerFilter: DrawerFilter

  openSession: (input: OpenSessionInput) => string
  closeSession: (id: string) => void
  focusSession: (id: string) => void
  renameSession: (id: string, title: string) => void
  killWorkspaceSessions: (workspaceId: string) => void
  toggleRail: () => void
  toggleDrawer: () => void
  toggleGroup: (workspaceId: string) => void
  collapseAllGroups: () => void
  setDrawerQuery: (query: string) => void
  setDrawerFilter: (filter: DrawerFilter) => void
  focusAdjacentSession: (offset: 1 | -1) => void
}

/**
 * Auto-names a tab after its repo, suffixing when the repo already has tabs:
 * "backend", then "backend 2", "backend 3".
 */
function nextTitle(sessions: TerminalSession[], repoName: string): string {
  const sameRepo = sessions.filter(session => session.repoName === repoName)
  if (sameRepo.length === 0) return repoName
  return `${repoName} ${sameRepo.length + 1}`
}

function shortenHome(absolutePath: string): string {
  const home = (window.electronAPI.platform === 'win32' ? '' : '~')
  if (!home) return absolutePath
  const match = absolutePath.match(/^\/Users\/[^/]+\/(.*)$|^\/home\/[^/]+\/(.*)$/)
  if (!match) return absolutePath
  return `~/${match[1] ?? match[2]}`
}

export const useTerminalStore = create<TerminalState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,
      railOpen: true,
      drawerOpen: true,
      collapsedGroupIds: [],
      drawerQuery: '',
      drawerFilter: 'all',

      openSession: (input) => {
        const id = makeSessionId()
        const now = Date.now()
        const session: TerminalSession = {
          id,
          workspaceId: input.workspaceId,
          workspaceName: input.workspaceName,
          repoId: input.repoId,
          repoName: input.repoName,
          title: nextTitle(get().sessions, input.repoName),
          cwd: input.cwd,
          shell: DEFAULT_SHELL,
          // Placeholder until the PTY daemon reports real state. Nothing here
          // is fabricated: the stats below are facts we already know.
          state: 'idle',
          stats: [
            { label: DEFAULT_SHELL, tone: 'dim' },
            { label: shortenHome(input.cwd), tone: 'dim' },
          ],
          createdAt: now,
          lastActiveAt: now,
        }
        set({ sessions: [...get().sessions, session], activeSessionId: id })
        return id
      },

      closeSession: (id) => {
        const { sessions, activeSessionId } = get()
        const index = sessions.findIndex(session => session.id === id)
        if (index === -1) return
        const next = sessions.filter(session => session.id !== id)
        const nextActive = activeSessionId === id
          ? (next[index]?.id ?? next[index - 1]?.id ?? next[next.length - 1]?.id ?? null)
          : activeSessionId
        set({ sessions: next, activeSessionId: nextActive })
      },

      focusSession: (id) => {
        set({
          activeSessionId: id,
          sessions: get().sessions.map(session =>
            session.id === id ? { ...session, lastActiveAt: Date.now() } : session
          ),
        })
      },

      renameSession: (id, title) => {
        const trimmed = title.trim()
        if (!trimmed) return
        set({
          sessions: get().sessions.map(session =>
            session.id === id ? { ...session, title: trimmed } : session
          ),
        })
      },

      killWorkspaceSessions: (workspaceId) => {
        const next = get().sessions.filter(session => session.workspaceId !== workspaceId)
        const stillActive = next.some(session => session.id === get().activeSessionId)
        set({
          sessions: next,
          activeSessionId: stillActive ? get().activeSessionId : (next[next.length - 1]?.id ?? null),
        })
      },

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
        if (next) get().focusSession(next.id)
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
