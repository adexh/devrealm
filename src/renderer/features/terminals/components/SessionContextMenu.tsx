import { useEffect } from 'react'
import { Pencil } from 'lucide-react'

export function SessionContextMenu({ x, y, onRename, onClose }: {
  x: number
  y: number
  onRename: () => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={event => { event.stopPropagation(); onClose() }}
        onContextMenu={event => { event.preventDefault(); event.stopPropagation(); onClose() }}
      />
      <div
        role="menu"
        style={{ left: x, top: y }}
        onClick={event => event.stopPropagation()}
        className="fixed z-50 min-w-32 p-1 rounded bg-tm-2 border border-tm-line/60 shadow-lg"
      >
        <button
          type="button"
          role="menuitem"
          autoFocus
          onClick={() => { onClose(); onRename() }}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-[12px] leading-4 text-tm-ink hover:bg-tm-3 hover:text-tm-ink-strong bg-transparent border-none cursor-pointer text-left"
        >
          <Pencil size={13} aria-hidden="true" />
          <span>Rename</span>
        </button>
      </div>
    </>
  )
}
