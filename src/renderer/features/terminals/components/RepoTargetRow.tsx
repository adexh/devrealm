import { Folder, Plus, Terminal } from 'lucide-react'
import type { LaunchTarget } from '../types'

export function RepoTargetRow({ target, onLaunch }: {
  target: LaunchTarget
  onLaunch: () => void
}) {
  if (!target.hasLocalPath) {
    return (
      <div className="p-2 rounded bg-tm-0 flex items-center justify-between gap-2" title="Not cloned yet">
        <span className="flex items-center gap-2 min-w-0">
          <Folder size={16} className="text-tm-ink-dim shrink-0" aria-hidden="true" />
          <span className="font-mono text-[11px] leading-4 text-tm-ink-dim truncate">{target.name}</span>
        </span>
        <span className="font-mono text-[10px] leading-[14px] px-1 rounded bg-tm-2 text-tm-ink-dim shrink-0">
          clone
        </span>
      </div>
    )
  }

  if (target.openCount > 0) {
    return (
      <div className="p-2 rounded bg-tm-1 flex flex-col gap-1.5 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 min-w-0">
            <Terminal size={16} className="text-tm-ok shrink-0" aria-hidden="true" />
            <span className="font-mono text-[11px] leading-4 text-tm-ink-strong font-semibold truncate">
              {target.name}
            </span>
          </span>
          <span className="font-mono text-[10px] leading-[14px] px-1 rounded bg-tm-2 text-tm-ok shrink-0">
            {target.openCount} open
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] leading-[14px] text-tm-ink-dim truncate">{target.path}</span>
          <button
            type="button"
            onClick={onLaunch}
            className="px-2 py-0.5 rounded bg-tm-2 hover:bg-tm-5 text-tm-ink-strong font-mono text-[10px] leading-[14px] flex items-center gap-1 transition-colors shrink-0 border-none cursor-pointer"
          >
            <Plus size={12} aria-hidden="true" />
            <span>Shell</span>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      onClick={onLaunch}
      title={target.path}
      className="p-2 rounded bg-tm-0 hover:bg-tm-1 flex items-center justify-between gap-2 transition-colors group cursor-pointer"
    >
      <span className="flex items-center gap-2 min-w-0">
        <Folder size={16} className="text-tm-ink-dim group-hover:text-tm-ink-strong shrink-0" aria-hidden="true" />
        <span className="font-mono text-[11px] leading-4 text-tm-ink-soft group-hover:text-tm-ink truncate">
          {target.name}
        </span>
      </span>
      <span className="opacity-0 group-hover:opacity-100 px-1.5 py-0.5 rounded bg-tm-2 text-tm-ink-strong font-mono text-[10px] leading-[14px] transition-opacity shrink-0">
        + Launch
      </span>
    </div>
  )
}
