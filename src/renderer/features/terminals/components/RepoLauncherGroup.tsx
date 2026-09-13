import { FolderOpen } from 'lucide-react'
import type { LaunchTarget, LaunchTargetGroup } from '../types'
import { RepoTargetRow } from './RepoTargetRow'

export function RepoLauncherGroup({ group, onLaunch }: {
  group: LaunchTargetGroup
  onLaunch: (target: LaunchTarget) => void
}) {
  const openCount = group.targets.filter(target => target.openCount > 0).length

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 px-1 py-1 text-tm-ink-soft">
        <span className="flex items-center gap-1.5 min-w-0">
          <FolderOpen size={14} className="text-tm-ink-dim shrink-0" aria-hidden="true" />
          <span className={openCount > 0
            ? 'text-[13px] leading-[18px] font-semibold text-tm-ink-strong truncate'
            : 'text-[13px] leading-[18px] font-semibold text-tm-ink truncate'}
          >
            {group.workspaceName}
          </span>
        </span>
        <span className="font-mono text-[10px] leading-[14px] text-tm-ink-dim shrink-0">
          {group.targets.length} {group.targets.length === 1 ? 'repo' : 'repos'}
        </span>
      </div>

      {group.targets.map(target => (
        <RepoTargetRow key={target.id} target={target} onLaunch={() => onLaunch(target)} />
      ))}
    </div>
  )
}
