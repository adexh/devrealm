import { useState } from 'react'
import { useTerminalStore } from '../../../stores/terminalStore'
import { dropZone, type PaneZone } from '../../../stores/terminalLayout'
import { DROP_PREVIEW_CLASS } from '../constants'

// Mounted only during a drag, so xterm never sees the drag and stays clickable otherwise.
export function PaneDropOverlay({ groupId, ownsDragged }: { groupId: string; ownsDragged: boolean }) {
  const [zone, setZone] = useState<PaneZone | null>(null)
  const dropDraggedOnPane = useTerminalStore(state => state.dropDraggedOnPane)

  return (
    <div
      className="absolute inset-0 z-20 overflow-hidden"
      onDragOver={event => {
        const rect = event.currentTarget.getBoundingClientRect()
        const next = dropZone(event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height)
        if (ownsDragged && next === 'center') {
          setZone(null)
          return
        }
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        setZone(next)
      }}
      onDragLeave={() => setZone(null)}
      onDrop={event => {
        event.preventDefault()
        setZone(null)
        dropDraggedOnPane(groupId, zone ?? 'center')
      }}
    >
      {zone && <div className={DROP_PREVIEW_CLASS[zone]} />}
    </div>
  )
}
