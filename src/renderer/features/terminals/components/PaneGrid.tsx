import { useRef } from 'react'
import { selectLayout, useTerminalStore } from '../../../stores/terminalStore'
import { placePanes } from '../../../stores/terminalLayout'
import { PaneSash } from './PaneSash'
import { TerminalPane } from './TerminalPane'

export function PaneGrid({ onNewShell }: { onNewShell: () => void }) {
  const layout = useTerminalStore(selectLayout)
  const resizePane = useTerminalStore(state => state.resizePane)
  const areaRef = useRef<HTMLDivElement>(null)

  if (!layout) return null
  const { panes, sashes } = placePanes(layout)

  return (
    <div ref={areaRef} className="relative flex-1 min-h-0">
      {panes.map(pane => (
        <TerminalPane key={pane.group.id} pane={pane} split={panes.length > 1} onNewShell={onNewShell} />
      ))}
      {sashes.map(sash => (
        <PaneSash key={sash.split.id} sash={sash} areaRef={areaRef} onResize={ratio => resizePane(sash.split.id, ratio)} />
      ))}
    </div>
  )
}
