import { useState } from 'react'

/** Reports the pointer; the parent decides whether that is a ratio or a width. NaN means reset. */
export function ResizeHandle({ onDrag }: { onDrag: (clientX: number) => void }) {
  const [dragging, setDragging] = useState(false)

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      title="Drag to resize, double click to reset"
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
        ? 'relative w-1 shrink-0 cursor-col-resize select-none touch-none bg-tm-ok/60'
        : 'relative w-1 shrink-0 cursor-col-resize select-none touch-none bg-tm-line/40 hover:bg-tm-ok/60 transition-colors'}
    >
      <span className="absolute inset-y-0 -left-1.5 -right-1.5" aria-hidden="true" />
    </div>
  )
}
