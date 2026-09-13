import { useRef } from 'react'
import { GitBranch, Terminal } from 'lucide-react'
import type { TerminalSession } from '../types'

/**
 * Host element for the session's xterm instance.
 *
 * The PTY daemon is not built yet, so nothing is attached to `hostRef` and no
 * shell output is shown. Rendering invented output here would be a lie about a
 * shell that is not running, so the surface reports the real session facts and
 * an explicit not-connected state instead. When the daemon lands, the xterm
 * instance mounts into `hostRef` and this placeholder is removed.
 */
export function TerminalSurface({ session }: { session: TerminalSession }) {
  const hostRef = useRef<HTMLDivElement>(null)

  return (
    <div className="flex-1 min-h-0 bg-tm-0 flex flex-col">
      {/* xterm mounts here once the daemon lands; hidden so it claims no space yet. */}
      <div ref={hostRef} hidden className="flex-1 min-h-0" />

      <div className="flex-1 min-h-0 overflow-y-auto p-4 font-mono text-[11px] leading-relaxed select-text space-y-2 scrollbar-thin">
        <div className="text-tm-ink-dim flex items-center gap-2 pb-2 flex-wrap">
          <span>Session opened {new Date(session.createdAt).toLocaleTimeString()}</span>
          <span className="text-tm-line">•</span>
          <span className="text-tm-ok-dim">{session.shell}</span>
        </div>

        <div className="flex items-start gap-2">
          <Terminal size={14} className="text-tm-ok-dim shrink-0 mt-0.5" aria-hidden="true" />
          <span className="text-tm-ink-strong break-all">{session.cwd}</span>
        </div>

        <div className="p-3 my-2 rounded bg-tm-1 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-tm-ink-strong font-semibold">Shell backend not connected</span>
            <span className="font-mono text-[10px] leading-[14px] px-1.5 rounded bg-tm-2 text-tm-ink-dim font-semibold">
              PENDING
            </span>
          </div>
          <p className="text-tm-ink-soft pt-1">
            The session UI is live and this tab is tracked, but no PTY is attached yet.
            Interactive shells arrive with the terminal daemon.
          </p>
        </div>

        <div className="pt-4 space-y-1">
          <div className="flex items-center gap-2 text-tm-ink-dim font-mono text-[10px] leading-[14px] flex-wrap">
            <span className="text-tm-ink-strong font-semibold">{session.repoName}</span>
            <span>in</span>
            <span className="text-tm-warn flex items-center gap-0.5">
              <GitBranch size={13} aria-hidden="true" />
              {session.workspaceName}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-tm-ok font-bold select-none">❯</span>
            <span className="w-2.5 h-4 bg-tm-ink-dim inline-block animate-pulse shrink-0" aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  )
}
