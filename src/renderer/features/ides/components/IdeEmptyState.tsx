import type { ReactNode } from 'react'
import { MonitorOff, SquareCode } from 'lucide-react'
import type { IdeSnapshot } from '../../../../shared/ide'
import { VSCODE_INSTALL_URL } from '../constants'
import { openExternalUrl } from '../ipc/ides'

/** Shown above the groups whenever there are no windows; the groups below still offer repos to open. */
export function IdeEmptyState({ snapshot }: { snapshot: IdeSnapshot }) {
  if (!snapshot.installed) {
    return (
      <Frame icon={<MonitorOff size={26} className="text-tm-ink-dim" aria-hidden="true" />} title={`${snapshot.label} was not found`}>
        <p>DevRealm looked for the app bundle and the command line tool and found neither.</p>
        <button
          type="button"
          onClick={() => { void openExternalUrl(VSCODE_INSTALL_URL) }}
          className="mt-2 px-3 py-1.5 rounded bg-tm-4 text-tm-ink-strong text-[13px] leading-[18px] font-semibold hover:bg-tm-5 transition-colors border-none cursor-pointer"
        >
          Get {snapshot.label}
        </button>
      </Frame>
    )
  }

  if (!snapshot.running) {
    return (
      <Frame icon={<SquareCode size={26} className="text-tm-ink-dim" aria-hidden="true" />} title={`${snapshot.label} is not running`}>
        <p>Open a repo below and its window will show up here, with everything else you open after it.</p>
      </Frame>
    )
  }

  if (snapshot.source === 'none') {
    return (
      <Frame icon={<SquareCode size={26} className="text-tm-ink-dim" aria-hidden="true" />} title={`${snapshot.label} is running, but its windows could not be listed`}>
        <p>The warnings above say why. Process totals in the summary are still live.</p>
      </Frame>
    )
  }

  return (
    <Frame icon={<SquareCode size={26} className="text-tm-ink-dim" aria-hidden="true" />} title="No windows open">
      <p>{snapshot.label} is running in the background with nothing open. Pick a repo below to give it one.</p>
    </Frame>
  )
}

function Frame({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 px-6 text-center rounded border border-dashed border-tm-line/60">
      {icon}
      <p className="text-[15px] leading-5 font-semibold text-tm-ink">{title}</p>
      <div className="text-[12px] leading-4 text-tm-ink-dim max-w-md space-y-1">{children}</div>
    </div>
  )
}
