import { ChevronsDownUp, Command, Terminal, X } from 'lucide-react'
import { groupSessions, useTerminalStore } from '../hooks/useTerminalStore'
import { SessionRailGroup } from './SessionRailGroup'

export function SessionRail({ onQuickSwitch }: { onQuickSwitch: () => void }) {
  const sessions = useTerminalStore(state => state.sessions)
  const activeSessionId = useTerminalStore(state => state.activeSessionId)
  const collapsedGroupIds = useTerminalStore(state => state.collapsedGroupIds)
  const focusSession = useTerminalStore(state => state.focusSession)
  const renameSession = useTerminalStore(state => state.renameSession)
  const toggleGroup = useTerminalStore(state => state.toggleGroup)
  const collapseAllGroups = useTerminalStore(state => state.collapseAllGroups)
  const killWorkspaceSessions = useTerminalStore(state => state.killWorkspaceSessions)

  const groups = groupSessions(sessions)
  const activeSession = sessions.find(session => session.id === activeSessionId) ?? null

  return (
    <aside className="w-64 bg-tm-0 flex flex-col shrink-0 overflow-hidden border-r border-tm-line/40">
      <div className="h-9 px-3 bg-tm-1 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Terminal size={15} className="text-tm-ink-dim" aria-hidden="true" />
          <span className="text-[10px] leading-[14px] font-semibold uppercase tracking-widest text-tm-ink-soft">
            Sessions
          </span>
          <span className="font-mono text-[10px] leading-[14px] px-1.5 rounded bg-tm-4 text-tm-ink-strong font-semibold">
            {sessions.length}
          </span>
        </div>
        <button
          type="button"
          onClick={collapseAllGroups}
          title="Collapse all groups"
          className="text-tm-ink-dim hover:text-tm-ink-strong flex items-center bg-transparent border-none cursor-pointer p-0"
        >
          <ChevronsDownUp size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-1 space-y-3 scrollbar-thin">
        {groups.length === 0 ? (
          <p className="px-2 py-6 text-[12px] leading-4 text-tm-ink-dim text-center">
            No shells open. Launch one from the repo drawer, or press ⌘T.
          </p>
        ) : groups.map(group => (
          <SessionRailGroup
            key={group.workspaceId}
            group={group}
            collapsed={collapsedGroupIds.includes(group.workspaceId)}
            activeSessionId={activeSessionId}
            onToggle={() => toggleGroup(group.workspaceId)}
            onFocus={focusSession}
            onRename={renameSession}
          />
        ))}
      </div>

      <div className="p-1 bg-tm-1 flex flex-col gap-1 shrink-0">
        <button
          type="button"
          onClick={onQuickSwitch}
          className="w-full flex items-center justify-between px-2 py-1.5 rounded bg-tm-2 hover:bg-tm-3 text-tm-ink text-[12px] leading-4 transition-colors border-none cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Command size={16} className="text-tm-ink-dim" aria-hidden="true" />
            <span>Quick Switcher</span>
          </span>
          <kbd className="font-mono text-[10px] leading-[14px] px-1 rounded bg-tm-0 text-tm-ink-dim">⌃Tab</kbd>
        </button>
        <button
          type="button"
          disabled={!activeSession}
          onClick={() => activeSession && killWorkspaceSessions(activeSession.workspaceId)}
          className="w-full flex items-center justify-center gap-1 py-1 rounded text-tm-err hover:bg-tm-2 disabled:opacity-40 text-[10px] leading-[14px] font-semibold uppercase tracking-wider transition-colors bg-transparent border-none cursor-pointer"
        >
          <X size={14} aria-hidden="true" />
          <span>Kill all in workspace</span>
        </button>
      </div>
    </aside>
  )
}
