import { Modal, Btn } from './ui'

export type UpdateState =
  | { stage: 'checking' }
  | { stage: 'available'; version: string }
  | { stage: 'up-to-date' }
  | { stage: 'error'; message: string }

type Props = {
  state: UpdateState
  onClose: () => void
}

export function UpdateNotificationModal({ state, onClose }: Props) {
  if (state.stage === 'checking') {
    return (
      <Modal title="Check for updates" onClose={onClose} width={420}>
        <div className="flex items-center gap-3 py-1">
          <svg className="animate-spin w-4 h-4 text-t-accent shrink-0" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <p className="text-[13px] text-t-ink-soft">Checking for updates…</p>
        </div>
      </Modal>
    )
  }

  if (state.stage === 'up-to-date') {
    return (
      <Modal title="Check for updates" onClose={onClose} width={420}>
        <div className="flex flex-col gap-4">
          <p className="text-[13px] text-t-ink-soft leading-relaxed">You're on the latest version.</p>
          <div className="flex justify-end">
            <Btn onClick={onClose}>Close</Btn>
          </div>
        </div>
      </Modal>
    )
  }

  if (state.stage === 'error') {
    return (
      <Modal title="Update check failed" onClose={onClose} width={420}>
        <div className="flex flex-col gap-4">
          <p className="text-[13px] text-t-ink-soft leading-relaxed">{state.message}</p>
          <div className="flex justify-end">
            <Btn onClick={onClose}>Close</Btn>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title="Update available" onClose={onClose} width={420}>
      <div className="flex flex-col gap-4">
        <p className="text-[13px] text-t-ink leading-relaxed">
          Version <span className="font-medium">{state.version}</span> is available.
          Download and install it manually from the releases page.
        </p>
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>Later</Btn>
          <Btn primary onClick={() => { void window.electronAPI.updater.openReleasePage(); onClose() }}>
            View release
          </Btn>
        </div>
      </div>
    </Modal>
  )
}
