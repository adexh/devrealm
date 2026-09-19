import { ExternalLink } from 'lucide-react'
import { Spinner } from '../../../components/Spinner'
import { shortenHome } from '../../../utils/paths'
import type { IdeUnopenedRepo } from '../types'

export function IdeUnopenedRepoRow({ target, busy, onOpen }: {
  target: IdeUnopenedRepo
  busy: boolean
  onOpen: () => void
}) {
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-1.5 border-b border-tm-line/20 last:border-b-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[12px] leading-4 font-medium text-tm-ink truncate">{target.repo.name}</span>
        <span className="font-mono text-[10px] leading-[14px] text-tm-ink-dim truncate hidden md:inline">{shortenHome(target.path)}</span>
      </div>
      <button
        type="button"
        onClick={onOpen}
        disabled={busy}
        title="Open this repo in a new VS Code window"
        className="flex items-center gap-1 px-2 py-1 rounded bg-tm-2 text-tm-ink-dim hover:bg-tm-3 hover:text-tm-ink-strong text-[11px] leading-4 transition-colors border-none cursor-pointer disabled:opacity-60 shrink-0"
      >
        {busy ? <Spinner size={12} /> : <ExternalLink size={13} aria-hidden="true" />}
        <span>Open</span>
      </button>
    </li>
  )
}
