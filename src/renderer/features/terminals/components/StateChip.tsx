import type { SessionState } from '../types'
import { STATE_LABEL, STATE_TONE } from '../constants'

const TONE_CLASS = {
  ok: 'bg-tm-2 text-tm-ok',
  warn: 'bg-tm-3 text-tm-warn-dim',
  dim: 'bg-tm-4 text-tm-ink-dim',
  err: 'bg-tm-3 text-tm-err',
}

export function StateChip({ state, label }: { state: SessionState; label?: string }) {
  return (
    <span className={`font-mono text-[10px] leading-[14px] tracking-[0.2px] font-medium px-1.5 rounded shrink-0 ${TONE_CLASS[STATE_TONE[state]]}`}>
      {label ?? STATE_LABEL[state]}
    </span>
  )
}
