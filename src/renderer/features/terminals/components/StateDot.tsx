import type { SessionState } from '../types'
import { BUSY_STATES } from '../constants'

const DOT_CLASS: Record<SessionState, string> = {
  booting: 'bg-tm-warn',
  running: 'bg-tm-ok',
  working: 'bg-tm-warn',
  idle: 'bg-tm-ink-dim',
  exited: 'bg-tm-ink-dim',
  failed: 'bg-tm-err',
}

export function StateDot({ state, large = false }: { state: SessionState; large?: boolean }) {
  const size = large ? 'w-2 h-2' : 'w-1.5 h-1.5'
  const pulse = BUSY_STATES.includes(state) ? ' animate-pulse' : ''

  return <span className={`${size} rounded-full shrink-0 ${DOT_CLASS[state]}${pulse}`} aria-hidden="true" />
}
