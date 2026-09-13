import { Terminal } from 'lucide-react'

export function TerminalEmptyState({ onOpenDrawer }: { onOpenDrawer: () => void }) {
  return (
    <div className="flex-1 min-h-0 bg-tm-0 flex flex-col items-center justify-center gap-4 p-8">
      <Terminal size={28} className="text-tm-ink-dim" aria-hidden="true" />
      <div className="text-center space-y-1">
        <p className="text-[15px] leading-5 font-semibold text-tm-ink">No shell open</p>
        <p className="text-[12px] leading-4 text-tm-ink-dim max-w-80">
          Pick a repo and a terminal opens already sitting in it. No paths, no cd.
        </p>
      </div>
      <button
        type="button"
        onClick={onOpenDrawer}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-tm-4 text-tm-ink-strong text-[13px] leading-[18px] font-semibold hover:bg-tm-5 transition-colors border-none cursor-pointer"
      >
        Browse repos
        <kbd className="font-mono text-[10px] leading-[14px] px-1.5 rounded bg-tm-0 text-tm-ink-dim">⌘B</kbd>
      </button>
    </div>
  )
}
