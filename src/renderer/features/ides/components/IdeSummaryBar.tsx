import { useEffect, useState } from 'react'
import { Activity, Power, RefreshCw } from 'lucide-react'
import type { IdeSnapshot } from '../../../../shared/ide'
import { fmtSize, relTimeFine } from '../../../utils/format'

export function IdeSummaryBar({ snapshot, refreshing, breakdownOpen, onRefresh, onToggleBreakdown, onQuit }: {
  snapshot: IdeSnapshot | null
  refreshing: boolean
  breakdownOpen: boolean
  onRefresh: () => void
  onToggleBreakdown: () => void
  onQuit: () => void
}) {
  // "updated 9s ago" has to move between polls, which can be ten seconds apart.
  const [, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick(tick => tick + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  const running = snapshot?.running ?? false
  const windowCount = snapshot?.windows.length ?? 0
  const usage = snapshot?.usage ?? null

  return (
    <section className="w-full bg-tm-0 border-b border-tm-line/30 px-3 py-1 flex items-center justify-between gap-3 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex items-center gap-1.5 px-2 py-1 bg-tm-1 rounded shrink-0">
          <span className="text-[13px] leading-[18px] font-semibold text-tm-ink">IDEs</span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 rounded shrink-0">
          <span className={running ? 'w-2 h-2 rounded-full bg-tm-ok-dim' : 'w-2 h-2 rounded-full bg-tm-ink-dim'} aria-hidden="true" />
          <span className="text-[13px] leading-[18px] font-medium text-tm-ink-soft">{snapshot?.label ?? 'VS Code'}</span>
          <span className="font-mono text-[10px] leading-[14px] text-tm-ink-dim">
            {!snapshot ? '' : !snapshot.installed ? 'not installed' : running ? 'running' : 'not running'}
          </span>
        </div>
      </div>

      {snapshot && (
        <div className="hidden lg:flex items-center gap-3 font-mono text-[10px] leading-[14px] text-tm-ink-dim shrink-0">
          <span className="flex items-center gap-1.5 text-tm-ink">
            <span className={windowCount > 0 ? 'w-1.5 h-1.5 rounded-full bg-tm-ok' : 'w-1.5 h-1.5 rounded-full bg-tm-ink-dim'} aria-hidden="true" />
            {windowCount} {windowCount === 1 ? 'window' : 'windows'}
          </span>
          {usage && (
            <>
              <span className="text-tm-line">•</span>
              <span className="text-tm-ink-soft">{usage.processCount} processes</span>
              {usage.cpuPercent !== null && (
                <>
                  <span className="text-tm-line">•</span>
                  <span className={usage.cpuPercent >= 100 ? 'text-tm-warn-dim' : 'text-tm-ink-soft'}>CPU {usage.cpuPercent.toFixed(0)}%</span>
                </>
              )}
              <span className="text-tm-line">•</span>
              <span className="text-tm-ink-soft">{fmtSize(usage.memoryBytes)}</span>
            </>
          )}
          <span className="text-tm-line">•</span>
          <span title={snapshot.source === 'accessibility' ? 'Listed through Accessibility' : snapshot.source === 'cli' ? 'Listed through the VS Code command line' : 'Windows could not be listed'}>
            updated {relTimeFine(snapshot.capturedAt)}
          </span>
        </div>
      )}

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onToggleBreakdown}
          disabled={!usage}
          title="Where the CPU and memory go"
          className={breakdownOpen
            ? 'flex items-center gap-1 px-2.5 py-1 bg-tm-3 text-tm-ink-strong hover:bg-tm-5 rounded text-[12px] leading-4 transition-colors border-none cursor-pointer disabled:opacity-40'
            : 'flex items-center gap-1 px-2.5 py-1 bg-tm-2 text-tm-ink-dim hover:bg-tm-3 rounded text-[12px] leading-4 transition-colors border-none cursor-pointer disabled:opacity-40'}
        >
          <Activity size={16} aria-hidden="true" />
          <span className="hidden 2xl:inline">Usage</span>
        </button>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          title="Refresh now"
          className="flex items-center gap-1 px-2.5 py-1 bg-tm-2 text-tm-ink-dim hover:bg-tm-3 hover:text-tm-ink-strong rounded text-[12px] leading-4 transition-colors border-none cursor-pointer disabled:opacity-60"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} aria-hidden="true" />
          <span className="hidden 2xl:inline">Refresh</span>
        </button>
        <button
          type="button"
          onClick={onQuit}
          disabled={!snapshot?.capabilities.quit}
          title={running ? `Quit ${snapshot?.label ?? 'VS Code'} cleanly` : 'VS Code is not running'}
          className="flex items-center gap-1.5 px-3 py-1 bg-tm-4 text-tm-ink-strong text-[13px] leading-[18px] font-semibold rounded hover:bg-tm-5 transition-colors border-none cursor-pointer disabled:opacity-40 disabled:cursor-default"
        >
          <Power size={16} aria-hidden="true" />
          <span>Quit {snapshot?.label ?? 'VS Code'}</span>
        </button>
      </div>
    </section>
  )
}
