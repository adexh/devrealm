import { Btn, Modal } from '../../../components/ui'

/**
 * Closing a workspace tab kills every shell in it, which can mean losing a
 * running build or an agent mid-task, so it asks first and says what goes.
 */
export function CloseWorkspaceModal({ workspaceName, sessionCount, onCancel, onConfirm }: {
  workspaceName: string
  sessionCount: number
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Modal title="Close workspace" onClose={onCancel} width={420}>
      <div className="flex flex-col gap-4">
        <div className="text-[13px] leading-relaxed">
          Closing <strong>{workspaceName}</strong> kills{' '}
          <strong>{sessionCount} running {sessionCount === 1 ? 'shell' : 'shells'}</strong>.
          Anything still running in them, a build or an agent mid-task, stops immediately
          and their scrollback is discarded.
        </div>
        <div className="flex gap-2">
          <Btn primary onClick={onConfirm}>Close and kill {sessionCount}</Btn>
          <Btn onClick={onCancel}>Cancel</Btn>
        </div>
      </div>
    </Modal>
  )
}
