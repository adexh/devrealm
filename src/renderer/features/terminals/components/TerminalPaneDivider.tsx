import { useState } from 'react'

/** Drag handle between split panes. Reports the pointer, the parent maps it to a ratio. */
export function TerminalPaneDivider({ onDrag }: { onDrag: (clientX: number) => void }) {
  const [dragging, setDragging] = useState(false)

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      title="Drag to resize"
      onPointerDown={event => {
        event.currentTarget.setPointerCapture(event.pointerId)
        setDragging(true)
      }}
      onPointerMove={event => { if (dragging) onDrag(event.clientX) }}
      onPointerUp={event => {
        event.currentTarget.releasePointerCapture(event.pointerId)
        setDragging(false)
      }}
      onDoubleClick={() => onDrag(Number.NaN)}
      className={dragging
        ? 'w-1 shrink-0 cursor-col-resize bg-tm-ok/60'
        : 'w-1 shrink-0 cursor-col-resize bg-tm-line/40 hover:bg-tm-ok/60 transition-colors'}
    />
  )
}
