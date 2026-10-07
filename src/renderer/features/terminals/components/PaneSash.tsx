import { useState, type RefObject } from 'react'
import type { PlacedSash } from '../../../stores/terminalLayout'

const percent = (fraction: number) => `${fraction * 100}%`

export function PaneSash({ sash, areaRef, onResize }: {
  sash: PlacedSash
  areaRef: RefObject<HTMLDivElement | null>
  onResize: (ratio: number) => void
}) {
  const [dragging, setDragging] = useState(false)
  const { split, rect } = sash
  const row = split.direction === 'row'

  function resizeTo(clientX: number, clientY: number) {
    const area = areaRef.current?.getBoundingClientRect()
    if (!area || area.width === 0 || area.height === 0) return
    onResize(row
      ? ((clientX - area.left) / area.width - rect.x) / rect.w
      : ((clientY - area.top) / area.height - rect.y) / rect.h)
  }

  return (
    <div
      role="separator"
      aria-orientation={row ? 'vertical' : 'horizontal'}
      title="Drag to resize, double click to even out"
      style={row
        ? { left: percent(rect.x + rect.w * split.ratio), top: percent(rect.y), height: percent(rect.h) }
        : { top: percent(rect.y + rect.h * split.ratio), left: percent(rect.x), width: percent(rect.w) }}
      onPointerDown={event => {
        event.currentTarget.setPointerCapture(event.pointerId)
        setDragging(true)
      }}
      onPointerMove={event => { if (dragging) resizeTo(event.clientX, event.clientY) }}
      onPointerUp={event => {
        event.currentTarget.releasePointerCapture(event.pointerId)
        setDragging(false)
      }}
      onDoubleClick={() => onResize(0.5)}
      className={row
        ? (dragging
          ? 'absolute z-10 w-1 -translate-x-1/2 cursor-col-resize select-none touch-none bg-tm-ok/60'
          : 'absolute z-10 w-1 -translate-x-1/2 cursor-col-resize select-none touch-none bg-tm-line/40 hover:bg-tm-ok/60 transition-colors')
        : (dragging
          ? 'absolute z-10 h-1 -translate-y-1/2 cursor-row-resize select-none touch-none bg-tm-ok/60'
          : 'absolute z-10 h-1 -translate-y-1/2 cursor-row-resize select-none touch-none bg-tm-line/40 hover:bg-tm-ok/60 transition-colors')}
    />
  )
}
