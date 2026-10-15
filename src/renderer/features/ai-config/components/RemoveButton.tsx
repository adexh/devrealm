import { Trash2 } from 'lucide-react'

export function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Remove"
      aria-label="Remove"
      className="h-6 w-6 inline-flex items-center justify-center rounded text-t-ink-soft hover:text-[#e05252] hover:bg-t-panel-alt cursor-pointer"
    >
      <Trash2 size={13} aria-hidden="true" />
    </button>
  )
}
