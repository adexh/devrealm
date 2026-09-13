import { useEffect, useRef } from 'react'
import { FolderTree, Lightbulb, Search } from 'lucide-react'
import { useLaunchTargets } from '../hooks/useLaunchTargets'
import { useTerminalStore } from '../hooks/useTerminalStore'
import type { DrawerFilter, LaunchTarget } from '../types'
import { RepoLauncherGroup } from './RepoLauncherGroup'

const FILTERS: { id: DrawerFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'recent', label: 'Recent' },
]

export function RepoLauncherDrawer({ onLaunch }: { onLaunch: (target: LaunchTarget) => void }) {
  const { groups, total, openCount } = useLaunchTargets()
  const query = useTerminalStore(state => state.drawerQuery)
  const filter = useTerminalStore(state => state.drawerFilter)
  const setDrawerQuery = useTerminalStore(state => state.setDrawerQuery)
  const setDrawerFilter = useTerminalStore(state => state.setDrawerFilter)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey) return
      const tag = (event.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      event.preventDefault()
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <aside className="w-72 bg-tm-0 flex flex-col shrink-0 overflow-hidden border-l border-tm-line/40">
      <div className="p-1 bg-tm-1 space-y-2 shrink-0">
        <div className="flex items-center justify-between gap-2 px-1 pt-1">
          <span className="flex items-center gap-2 min-w-0">
            <FolderTree size={15} className="text-tm-ink-dim shrink-0" aria-hidden="true" />
            <span className="text-[10px] leading-[14px] font-semibold uppercase tracking-widest text-tm-ink-soft truncate">
              Repos Launcher
            </span>
          </span>
          <span className="font-mono text-[10px] leading-[14px] px-1.5 rounded bg-tm-2 text-tm-ink-dim shrink-0">
            {total} total
          </span>
        </div>

        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-tm-0 focus-within:bg-tm-2 transition-colors">
          <Search size={15} className="text-tm-ink-dim shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={event => setDrawerQuery(event.target.value)}
            placeholder={`Filter ${total} repos...`}
            className="w-full bg-transparent border-none outline-none text-[12px] leading-4 text-tm-ink placeholder:text-tm-ink-dim"
          />
          <kbd className="font-mono text-[10px] leading-[14px] px-1 rounded bg-tm-2 text-tm-ink-dim shrink-0">/</kbd>
        </div>

        <div className="flex items-center gap-1 pb-0.5">
          {FILTERS.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => setDrawerFilter(item.id)}
              className={filter === item.id
                ? 'px-2 py-0.5 rounded bg-tm-3 text-tm-ink-strong font-mono text-[10px] leading-[14px] font-semibold border-none cursor-pointer'
                : 'px-2 py-0.5 rounded bg-tm-2 text-tm-ink-soft hover:text-tm-ink-strong font-mono text-[10px] leading-[14px] transition-colors border-none cursor-pointer'}
            >
              {item.id === 'open' ? `Open (${openCount})` : item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-1 space-y-3 scrollbar-thin">
        {groups.length === 0 ? (
          <p className="px-2 py-6 text-[12px] leading-4 text-tm-ink-dim text-center">
            No repos match. Add a workspace from the Dashboard.
          </p>
        ) : groups.map(group => (
          <RepoLauncherGroup key={group.workspaceId} group={group} onLaunch={onLaunch} />
        ))}
      </div>

      <div className="p-1 bg-tm-1 shrink-0">
        <div className="p-2 rounded bg-tm-0 flex items-start gap-2">
          <Lightbulb size={16} className="text-tm-ok-dim shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-[12px] leading-tight text-tm-ink-dim">
            Press{' '}
            <kbd className="font-mono text-[10px] px-1 rounded bg-tm-2 text-tm-ink">⇧Enter</kbd>
            {' '}on any{' '}
            <kbd className="font-mono text-[10px] px-1 rounded bg-tm-2 text-tm-ink">⌘K</kbd>
            {' '}repo result to open a terminal instantly with zero path typing.
          </p>
        </div>
      </div>
    </aside>
  )
}
