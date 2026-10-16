export function Segmented<T extends string>({ options, value, onChange }: {
  options: { id: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="inline-flex self-start border border-t-line rounded overflow-hidden">
      {options.map(option => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={option.id === value
            ? 'px-3 py-1.25 text-xs font-medium bg-t-accent-bg text-t-accent-ink cursor-pointer border-r border-t-line last:border-r-0'
            : 'px-3 py-1.25 text-xs font-medium text-t-ink-soft hover:text-t-ink cursor-pointer border-r border-t-line last:border-r-0'}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
