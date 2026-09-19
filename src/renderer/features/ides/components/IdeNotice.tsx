export function IdeNotice({ tone, text, actionLabel, onAction }: {
  tone: 'error' | 'warn'
  text: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className={tone === 'error'
      ? 'px-3 py-1.5 bg-tm-2 text-tm-err text-[12px] leading-4 flex items-center justify-between gap-3 shrink-0'
      : 'px-3 py-1.5 bg-tm-1 text-tm-warn text-[12px] leading-4 flex items-center justify-between gap-3 shrink-0'}
    >
      <span className="truncate" title={text}>{text}</span>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="text-tm-ink-dim hover:text-tm-ink-strong bg-transparent border-none cursor-pointer shrink-0"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
