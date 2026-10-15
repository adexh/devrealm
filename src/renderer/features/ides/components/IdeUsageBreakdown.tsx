import type { IdeUsage } from '../../../../shared/ide'
import { fmtSize } from '../../../utils/format'
import { PROCESS_KIND_HINT, PROCESS_KIND_LABEL } from '../constants'

export function IdeUsageBreakdown({ usage }: { usage: IdeUsage }) {
  const total = usage.memoryBytes || 1

  return (
    <section className="w-full bg-tm-1 border-b border-tm-line/30 px-4 py-3 shrink-0">
      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
        {usage.groups.map(group => (
          <div key={group.kind} className="flex flex-col gap-1" title={PROCESS_KIND_HINT[group.kind]}>
            <div className="flex items-center justify-between gap-3 text-[12px] leading-4">
              <span className="text-tm-ink truncate">
                {PROCESS_KIND_LABEL[group.kind]}
                <span className="font-mono text-[10px] text-tm-ink-dim"> ×{group.count}</span>
              </span>
              <span className="font-mono text-[10px] leading-[14px] text-tm-ink-soft shrink-0">
                {usage.cpuPercent === null ? '' : `CPU ${group.cpuPercent.toFixed(1)}% · `}{fmtSize(group.memoryBytes)}
              </span>
            </div>
            <div className="h-1 w-full rounded-full bg-tm-3 overflow-hidden">
              <div className="h-full bg-tm-ink-dim rounded-full" style={{ width: `${Math.max(2, (group.memoryBytes / total) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
      <p className="max-w-5xl mx-auto mt-2 text-[11px] leading-4 text-tm-ink-dim">
        Memory is resident set size summed across processes, so shared pages count more than once. CPU is a recent average per process, out of 100% per core.
        Per-window cost is not shown: VS Code does not publish which process belongs to which window.
      </p>
    </section>
  )
}
