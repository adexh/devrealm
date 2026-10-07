import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TerminalSessionInfo } from '../../shared/terminal'
import { useWorkspaceStore } from './workspaceStore'
import { DRAWER_WIDTH, HOME_WORKSPACE_ID, HOME_WORKSPACE_NAME, RAIL_WIDTH, SPLIT_RATIO } from '../features/terminals/constants'
import type { DrawerFilter, SessionStat, TerminalSession } from '../features/terminals/types'
import * as terminalsIpc from '../features/terminals/ipc/terminals'
import { shortenHome } from '../utils/paths'
import {
  activateSession,
  allSessionIds,
  closeGroup,
  dropOnGroup,
  dropOnTab,
  groupOf,
  insertSession,
  mergeGroups,
  orderByIds,
  paneGroups,
  reconcileLayout,
  removeSession,
  resizeSplit,
  splitGroup,
  type PaneNode,
  type PaneZone,
} from './terminalLayout'

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
  lastSessionByWorkspace: Record<string, string>
  layouts: Record<string, PaneNode>
  draggedSessionId: string | null
  error: string | null
  ready: boolean

  railOpen: boolean
  railWidth: number
  drawerOpen: boolean
  drawerWidth: number
  /** Hides both drawers to give the terminal the whole window. */
  maximized: boolean
  drawerQuery: string
  drawerFilter: DrawerFilter

  setActiveWorkspace: (workspaceId: string | null) => void
  init: () => Promise<void>
  refresh: () => Promise<void>
  openSession: (input: OpenSessionInput) => Promise<void>
  openRepoSession: (input: OpenSessionInput) => Promise<void>
  openHomeSession: () => Promise<void>
  closeSession: (id: string) => Promise<void>
  focusSession: (id: string) => void
  renameSession: (id: string, title: string) => string | null
  clearActiveTerminal: () => Promise<void>
  toggleSplit: () => void
  choosePaneSession: (id: string) => void
  closePane: (groupId: string) => void
  resizePane: (splitId: string, ratio: number) => void
  setDraggedSession: (id: string | null) => void
  dropDraggedOnPane: (groupId: string, zone: PaneZone) => void
  dropDraggedOnTab: (groupId: string, targetId: string | null, after: boolean) => void
  toggleMaximized: () => void
  killWorkspaceSessions: (workspaceId: string) => Promise<void>
  closeWorkspace: (workspaceId: string) => Promise<void>
  setError: (message: string | null) => void

  toggleRail: () => void
  toggleDrawer: () => void
  setRailWidth: (width: number) => void
  setDrawerWidth: (width: number) => void
  setDrawerQuery: (query: string) => void
  setDrawerFilter: (filter: DrawerFilter) => void
  focusAdjacentSession: (offset: 1 | -1) => void
}

/**
 * Maps a daemon session onto the view model. State is derived only from facts
 * the daemon reports; richer states such as "working" arrive when the daemon
 * grows activity detection.
 */
function toViewSession(info: TerminalSessionInfo): TerminalSession {
  const workspace = useWorkspaceStore.getState().workspaces.find(item => item.id === info.workspaceId)
  const workspaceName = info.workspaceId === HOME_WORKSPACE_ID
    ? HOME_WORKSPACE_NAME
    : (workspace?.name ?? 'Workspace')
  const stats: SessionStat[] = [
    { label: info.shell.split('/').pop() ?? info.shell, tone: 'dim' },
    { label: `pid ${info.pid}`, tone: 'dim' },
  ]

  return {
    ...info,
    workspaceName,
    state: info.exitCode === null ? 'running' : (info.exitCode === 0 ? 'exited' : 'failed'),
    statusLabel: info.exitCode !== null && info.exitCode !== 0 ? `EXIT ${info.exitCode}` : undefined,
    subtitle: shortenHome(info.cwd),
    stats,
  }
}

function titleTaken(sessions: TerminalSession[], workspaceId: string, title: string, exceptId?: string): boolean {
  const wanted = title.toLowerCase()
  return sessions.some(session =>
    session.workspaceId === workspaceId &&
    session.id !== exceptId &&
    session.title.toLowerCase() === wanted
  )
}

function nextTitle(sessions: TerminalSession[], workspaceId: string, repoName: string): string {
  let title = repoName
  for (let suffix = 2; titleTaken(sessions, workspaceId, title); suffix++) {
    title = `${repoName} ${suffix}`
  }
  return title
}

/** Set once the daemon feed is wired, so repeated init() calls do not stack listeners. */
let daemonFeed: (() => void) | null = null

function scopedIds(sessions: TerminalSession[], workspaceId: string | null): string[] {
  return sessions.filter(session => session.workspaceId === workspaceId).map(session => session.id)
}

function sessionToRestore(
  sessions: TerminalSession[],
  workspaceId: string | null,
  lastSessionByWorkspace: Record<string, string>,
  layouts: Record<string, PaneNode>,
): string | null {
  const inScope = orderByIds(
    sessions.filter(session => session.workspaceId === workspaceId),
    allSessionIds(workspaceId ? layouts[workspaceId] ?? null : null),
  )
  const remembered = workspaceId ? lastSessionByWorkspace[workspaceId] : undefined
  return inScope.find(session => session.id === remembered)?.id ?? inScope[0]?.id ?? null
}

function arrange(
  layouts: Record<string, PaneNode>,
  sessions: TerminalSession[],
  workspaceId: string | null,
  activeId: string | null,
): Record<string, PaneNode> {
  if (!workspaceId) return layouts
  const { [workspaceId]: saved, ...rest } = layouts
  const layout = reconcileLayout(saved ?? null, scopedIds(sessions, workspaceId), activeId)
  if (!layout) return rest
  return { ...rest, [workspaceId]: activeId && groupOf(layout, activeId) ? activateSession(layout, activeId) : layout }
}

export function selectLayout(state: Pick<TerminalState, 'layouts' | 'activeWorkspaceId'>): PaneNode | null {
  return state.activeWorkspaceId ? state.layouts[state.activeWorkspaceId] ?? null : null
}

function withLayout(state: TerminalState, layout: PaneNode): Pick<TerminalState, 'layouts'> {
  return state.activeWorkspaceId ? { layouts: { ...state.layouts, [state.activeWorkspaceId]: layout } } : { layouts: state.layouts }
}

function rememberFocus(state: TerminalState): Record<string, string> {
  const live = new Set(state.sessions.map(session => session.id))
  const next = Object.fromEntries(
    Object.entries(state.lastSessionByWorkspace).filter(([, id]) => live.has(id))
  )
  if (state.activeWorkspaceId && state.activeSessionId) {
    next[state.activeWorkspaceId] = state.activeSessionId
  }
  return next
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
      lastSessionByWorkspace: {},
      layouts: {},
      draggedSessionId: null,
      error: null,
      ready: false,

      railOpen: true,
      railWidth: RAIL_WIDTH.default,
      drawerOpen: true,
      drawerWidth: DRAWER_WIDTH.default,
      maximized: false,
      drawerQuery: '',
      drawerFilter: 'all',

      setActiveWorkspace: (workspaceId) => {
        const { sessions, layouts } = get()
        const lastSessionByWorkspace = rememberFocus(get())
        const restored = sessionToRestore(sessions, workspaceId, lastSessionByWorkspace, layouts)
        set({
          activeWorkspaceId: workspaceId,
          activeSessionId: restored,
          lastSessionByWorkspace,
          layouts: arrange(layouts, sessions, workspaceId, restored),
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
          const workspaceStillExists = activeWorkspaceId === HOME_WORKSPACE_ID ||
            knownWorkspaces.some(item => item.id === activeWorkspaceId)
          const workspaceId = workspaceStillExists ? activeWorkspaceId : null

          const { layouts, lastSessionByWorkspace } = get()
          const nextActive = sessions.some(session => session.id === activeSessionId && session.workspaceId === workspaceId)
            ? activeSessionId
            : sessionToRestore(sessions, workspaceId, lastSessionByWorkspace, layouts)
          set({
            sessions,
            error: null,
            activeWorkspaceId: workspaceId,
            activeSessionId: nextActive,
            layouts: arrange(layouts, sessions, workspaceId, nextActive),
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
            title: nextTitle(get().sessions, input.workspaceId, input.repoName),
            cwd: input.cwd,
            cols: 80,
            rows: 24,
          })
          const state = get()
          const layout = selectLayout(state)
          const target = input.workspaceId === state.activeWorkspaceId
            ? paneGroups(layout).find(group => group.sessionIds.length === 0) ?? groupOf(layout, state.activeSessionId) ?? paneGroups(layout)[0]
            : undefined
          set({
            lastSessionByWorkspace: rememberFocus(state),
            activeWorkspaceId: input.workspaceId,
            activeSessionId: info.id,
            ...(layout && target ? withLayout(state, insertSession(layout, target.id, info.id)) : {}),
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
          lastSessionByWorkspace: rememberFocus(get()),
          activeWorkspaceId: newest.workspaceId,
          activeSessionId: newest.id,
          layouts: arrange(get().layouts, get().sessions, newest.workspaceId, newest.id),
          error: null,
        })
      },

      /** An empty cwd tells the daemon to use the home directory. */
      openHomeSession: async () => {
        await get().openSession({
          workspaceId: HOME_WORKSPACE_ID,
          repoId: null,
          repoName: HOME_WORKSPACE_NAME.toLowerCase(),
          cwd: '',
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
        const layout = selectLayout(get())
        const after = layout ? removeSession(layout, id) : null
        // Focus stays in the pane it was in, on the neighbouring tab, as in VS Code.
        const owner = groupOf(layout, id)
        const nextActive = activeSessionId === id
          ? (paneGroups(after).find(group => group.id === owner?.id)?.activeId ?? paneGroups(after).find(group => group.activeId)?.activeId ??
            inScope[scopeIndex]?.id ?? inScope[scopeIndex - 1]?.id ?? inScope[inScope.length - 1]?.id ?? null)
          : activeSessionId
        const layouts = { ...get().layouts }
        if (activeWorkspaceId && after) layouts[activeWorkspaceId] = after
        set({
          sessions: remaining,
          activeSessionId: nextActive,
          layouts: arrange(layouts, remaining, activeWorkspaceId, nextActive),
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

      focusSession: (id) => {
        const { layouts, sessions, activeWorkspaceId } = get()
        set({ activeSessionId: id, layouts: arrange(layouts, sessions, activeWorkspaceId, id) })
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
       * Toggling off merges every pane's tabs back into one. Killing a shell
       * from what reads as a layout control would be a nasty surprise.
       */
      toggleSplit: () => {
        const state = get()
        const layout = selectLayout(state)
        const groups = paneGroups(layout)
        if (!layout) return
        if (groups.length > 1) set(withLayout(state, mergeGroups(layout, state.activeSessionId)))
        else set(withLayout(state, splitGroup(layout, groups[0].id, null, 'right')))
      },

      choosePaneSession: (id) => {
        const state = get()
        const layout = selectLayout(state)
        const waiting = paneGroups(layout).find(group => group.sessionIds.length === 0)
        if (!layout || !waiting) return
        set({ ...withLayout(state, dropOnGroup(layout, id, waiting.id, 'center')), activeSessionId: id })
      },

      closePane: (groupId) => {
        const state = get()
        const layout = selectLayout(state)
        if (!layout) return
        const next = closeGroup(layout, groupId)
        set({ ...withLayout(state, next), activeSessionId: groupOf(next, state.activeSessionId)?.activeId ?? state.activeSessionId })
      },

      resizePane: (splitId, ratio) => {
        const state = get()
        const layout = selectLayout(state)
        if (!layout) return
        set(withLayout(state, resizeSplit(layout, splitId, Math.min(SPLIT_RATIO.max, Math.max(SPLIT_RATIO.min, ratio)))))
      },

      setDraggedSession: (id) => set({ draggedSessionId: id }),

      dropDraggedOnPane: (groupId, zone) => {
        const state = get()
        const layout = selectLayout(state)
        const dragged = state.draggedSessionId
        set({ draggedSessionId: null })
        if (!layout || !dragged) return
        const next = dropOnGroup(layout, dragged, groupId, zone)
        if (next !== layout) set({ ...withLayout(state, next), activeSessionId: dragged })
      },

      dropDraggedOnTab: (groupId, targetId, after) => {
        const state = get()
        const layout = selectLayout(state)
        const dragged = state.draggedSessionId
        set({ draggedSessionId: null })
        if (!layout || !dragged) return
        const next = dropOnTab(layout, dragged, groupId, targetId, after)
        if (next !== layout) set({ ...withLayout(state, next), activeSessionId: dragged })
      },

      setRailWidth: (width) => set({
        railWidth: Math.min(RAIL_WIDTH.max, Math.max(RAIL_WIDTH.min, Math.round(width))),
      }),

      setDrawerWidth: (width) => set({
        drawerWidth: Math.min(DRAWER_WIDTH.max, Math.max(DRAWER_WIDTH.min, Math.round(width))),
      }),

      toggleMaximized: () => set({ maximized: !get().maximized }),

      renameSession: (id, title) => {
        const trimmed = title.trim()
        const { sessions } = get()
        const target = sessions.find(session => session.id === id)
        if (!target) return 'That terminal is gone'
        if (!trimmed) return 'Name cannot be empty'
        if (titleTaken(sessions, target.workspaceId, trimmed, id)) {
          return `"${trimmed}" is already used in this workspace`
        }
        set({
          sessions: sessions.map(session =>
            session.id === id ? { ...session, title: trimmed } : session
          ),
        })
        terminalsIpc.renameSession(id, trimmed).catch(error => {
          set({ error: message(error, 'Could not rename the terminal') })
          void get().refresh()
        })
        return null
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
        const state = get()
        const siblings = groupOf(selectLayout(state), state.activeSessionId)?.sessionIds ?? []
        const index = siblings.indexOf(state.activeSessionId ?? '')
        if (index === -1) return
        get().focusSession(siblings[(index + offset + siblings.length) % siblings.length])
      },
    }),
    {
      name: 'terminal-ui',
      partialize: (state) => ({
        railOpen: state.railOpen,
        drawerOpen: state.drawerOpen,
        activeWorkspaceId: state.activeWorkspaceId,
        // Recorded on every save, not only when leaving a workspace, so a restart comes back to the same tab.
        lastSessionByWorkspace: rememberFocus(state),
        layouts: state.layouts,
        railWidth: state.railWidth,
        drawerWidth: state.drawerWidth,
      }),
    }
  )
)
