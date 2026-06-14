export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <div
      className="rounded-full border-2 animate-spin shrink-0"
      style={{
        width: size,
        height: size,
        borderColor: 'var(--t-line)',
        borderTopColor: 'var(--t-ink)',
      }}
    />
  )
}
