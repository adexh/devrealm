import type { UpdateCheckResult } from '../../shared/types'
import { Modal, Btn } from './ui'
import { Spinner } from './Spinner'

export type UpdateState =
  | { status: 'checking' }
  | { status: 'installing'; currentVersion: string; latestVersion: string }
  | UpdateCheckResult

type Props = {
  state: UpdateState
  onInstall: (currentVersion: string, latestVersion: string) => void
  onClose: () => void
}

const canInstallInApp = window.electronAPI.platform !== 'win32'

function VersionRow({ label, version, strong = false }: { label: string; version: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between text-[13px]">
      <span className="text-t-ink-soft">{label}</span>
      <span className={strong ? 'font-mono font-medium text-t-ink' : 'font-mono text-t-ink-soft'}>v{version}</span>
    </div>
  )
}

export function UpdateNotificationModal({ state, onInstall, onClose }: Props) {
  if (state.status === 'checking') {
    return (
      <Modal title="Check for updates" onClose={onClose} width={420}>
        <div className="flex items-center gap-3 py-1">
          <Spinner size={16} />
          <p className="text-[13px] text-t-ink-soft">Checking for updates…</p>
        </div>
      </Modal>
    )
  }

  if (state.status === 'up-to-date') {
    return (
      <Modal title="Check for updates" onClose={onClose} width={420}>
        <div className="flex flex-col gap-4">
          <p className="text-[13px] text-t-ink-soft leading-relaxed">You're on the latest version.</p>
          <VersionRow label="Current version" version={state.currentVersion} strong />
          <div className="flex justify-end">
            <Btn onClick={onClose}>Close</Btn>
          </div>
        </div>
      </Modal>
    )
  }

  if (state.status === 'error') {
    return (
      <Modal title="Check for updates" onClose={onClose} width={420}>
        <div className="flex flex-col gap-4">
          <p className="text-[13px] text-t-ink-soft leading-relaxed wrap-break-word">{state.message}</p>
          <VersionRow label="Current version" version={state.currentVersion} />
          <div className="flex justify-end gap-2">
            <Btn onClick={() => { void window.electronAPI.updater.openReleasePage(); onClose() }}>View on GitHub</Btn>
            <Btn onClick={onClose}>Close</Btn>
          </div>
        </div>
      </Modal>
    )
  }

  if (state.status === 'installing') {
    return (
      <Modal title={`Updating to v${state.latestVersion}`} onClose={onClose} width={420}>
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <Spinner size={16} />
            <p className="text-[13px] text-t-ink-soft leading-relaxed">
              Building the new version. This takes a few minutes, and DevRealm restarts on its own when it's ready.
              Your terminals keep running through the restart.
            </p>
          </div>
          <div className="flex justify-end">
            <Btn onClick={onClose}>Hide</Btn>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title="Update available" onClose={onClose} width={420}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <VersionRow label="Current version" version={state.currentVersion} />
          <VersionRow label="New version" version={state.latestVersion} strong />
        </div>
        <p className="text-[12px] text-t-ink-soft leading-relaxed">
          {canInstallInApp
            ? 'Update now builds the new version and restarts DevRealm. You can keep working while it builds.'
            : 'Re-run the DevRealm installer to update.'}
        </p>
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>Later</Btn>
          <Btn primary={!canInstallInApp} onClick={() => { void window.electronAPI.updater.openReleasePage(); onClose() }}>
            View on GitHub
          </Btn>
          {canInstallInApp && (
            <Btn primary onClick={() => onInstall(state.currentVersion, state.latestVersion)}>Update now</Btn>
          )}
        </div>
      </div>
    </Modal>
  )
}
