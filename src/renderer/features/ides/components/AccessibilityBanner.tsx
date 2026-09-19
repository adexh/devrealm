import { ShieldCheck } from 'lucide-react'

export function AccessibilityBanner({ onGrant, onOpenSettings, onDismiss }: {
  onGrant: () => void
  onOpenSettings: () => void
  onDismiss: () => void
}) {
  return (
    <div className="px-4 py-2.5 bg-tm-2 border-b border-tm-line/30 flex items-center gap-3 shrink-0">
      <ShieldCheck size={18} className="text-tm-ink-soft shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-0 text-[12px] leading-4 text-tm-ink-soft">
        <span className="font-semibold text-tm-ink">Accessibility unlocks live refresh and Close.</span>{' '}
        Without it, windows are listed through the VS Code command line, which takes a few seconds and cannot close a window.
        macOS asks for two things: permission to control System Events, then Accessibility for DevRealm.
      </div>
      <button
        type="button"
        onClick={onGrant}
        className="px-3 py-1 rounded bg-tm-4 text-tm-ink-strong text-[12px] leading-4 font-semibold hover:bg-tm-5 transition-colors border-none cursor-pointer shrink-0"
      >
        Grant access
      </button>
      <button
        type="button"
        onClick={onOpenSettings}
        className="px-2.5 py-1 rounded bg-tm-1 text-tm-ink-soft text-[12px] leading-4 hover:bg-tm-3 hover:text-tm-ink-strong transition-colors border-none cursor-pointer shrink-0"
      >
        Open System Settings
      </button>
      <button
        type="button"
        onClick={onDismiss}
        className="px-2 py-1 rounded text-tm-ink-dim text-[12px] leading-4 hover:text-tm-ink-strong bg-transparent border-none cursor-pointer shrink-0"
      >
        Not now
      </button>
    </div>
  )
}
