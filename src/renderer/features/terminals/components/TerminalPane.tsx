import { useTerminalStore } from '../../../stores/terminalStore'
import type { PlacedPane } from '../../../stores/terminalLayout'
import { PaneDropOverlay } from './PaneDropOverlay'
import { TerminalPaneChooser } from './TerminalPaneChooser'
import { TerminalSurface } from './TerminalSurface'
import { TerminalTabBar } from './TerminalTabBar'

const percent = (fraction: number) => `${fraction * 100}%`

export function TerminalPane({ pane, split, onNewShell }: { pane: PlacedPane; split: boolean; onNewShell: () => void }) {
  const { group, rect } = pane
  const session = useTerminalStore(state => state.sessions.find(item => item.id === group.activeId)) ?? null
  const focused = useTerminalStore(state => state.activeSessionId !== null && group.sessionIds.includes(state.activeSessionId))
  const draggedSessionId = useTerminalStore(state => state.draggedSessionId)
  const focusSession = useTerminalStore(state => state.focusSession)
  const ownsDragged = draggedSessionId !== null && group.sessionIds.includes(draggedSessionId)

  return (
    <div
      onMouseDownCapture={() => { if (group.activeId) focusSession(group.activeId) }}
      style={{ left: percent(rect.x), top: percent(rect.y), width: percent(rect.w), height: percent(rect.h) }}
      className={split && focused
        ? 'absolute min-w-0 min-h-0 flex flex-col border-t-2 border-tm-ok'
        : 'absolute min-w-0 min-h-0 flex flex-col border-t-2 border-transparent'}
    >
      <TerminalTabBar group={group} split={split} onNewTab={onNewShell} />
      <div className="relative flex-1 min-h-0 flex flex-col">
        {session
          ? <TerminalSurface key={session.id} session={session} />
          : group.sessionIds.length === 0 && <TerminalPaneChooser groupId={group.id} />}
        {draggedSessionId && !(ownsDragged && group.sessionIds.length === 1) && (
          <PaneDropOverlay groupId={group.id} ownsDragged={ownsDragged} />
        )}
      </div>
    </div>
  )
}
