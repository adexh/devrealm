import { Btn, Modal } from '../../../components/ui'

export function QuitIdeModal({ label, windowCount, dirtyCount, onConfirm, onClose }: {
  label: string
  windowCount: number
  dirtyCount: number
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal title={`Quit ${label}?`} onClose={onClose} width={440}>
      <div className="flex flex-col gap-4">
        <p className="text-[13px] leading-relaxed text-t-ink">
          This asks {label} to quit the way the system would, closing {windowCount} {windowCount === 1 ? 'window' : 'windows'}.
          {dirtyCount > 0
            ? ` ${dirtyCount} of them ${dirtyCount === 1 ? 'has' : 'have'} unsaved changes; ${label} will ask what to do with them.`
            : ` Nothing appears to be unsaved.`}
        </p>
        <div className="flex items-center justify-end gap-2">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn primary onClick={onConfirm}>Quit {label}</Btn>
        </div>
      </div>
    </Modal>
  )
}
