import React, { useState } from 'react'
import { Check, SquareCode, Terminal, Trash2 } from 'lucide-react'
import type { Repo } from '../../../../shared/types'
import { Btn, Chip, Mono, GitIcon, Modal } from '../../../components/ui'
import { fmtSize, relTime } from '../../dashboard'
import { useNavigationStore } from '../../../stores/navigationStore'
import { useTerminalStore } from '../../../stores/terminalStore'
import { STALE_REPO_MS } from '../../../constants'
import { openRepoInEditor } from '../ipc/repos'

export function RepoRow({ repo, aiConfigured, onError, cloning, onClone, onDelete }: {
  repo: Repo; aiConfigured: boolean; onError: (msg: string) => void; cloning: boolean; onClone: () => void; onDelete: () => void
}) {
  const hasLocalPath = Boolean(repo.path)
  const isStale = Date.now() - repo.lastOpenedAt > STALE_REPO_MS
  const [showConfirm, setShowConfirm] = useState(false)
  const openRepoSession = useTerminalStore(state => state.openRepoSession)
  const navigateToTerminals = useNavigationStore(state => state.navigateToTerminals)

  async function openInEditor() {
    if (!hasLocalPath) return
    try {
      await openRepoInEditor(repo.path)
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : 'Failed to open repository')
    }
  }

  async function openInTerminal() {
    if (!hasLocalPath) return
    navigateToTerminals()
    await openRepoSession({
      workspaceId: repo.workspaceId,
      repoId: repo.id,
      repoName: repo.name,
      cwd: repo.path,
    })
  }

  return (
    <>
      {showConfirm && (
        <Modal title="Remove repository" onClose={() => setShowConfirm(false)} width={400}>
          <div className="flex flex-col gap-4">
            <div className="text-[13px] leading-relaxed">
              Remove <strong>{repo.name}</strong> from this workspace? The files on disk are not deleted.
            </div>
            <div className="flex gap-2">
              <Btn primary onClick={() => { setShowConfirm(false); onDelete() }}>Remove</Btn>
              <Btn onClick={() => setShowConfirm(false)}>Cancel</Btn>
            </div>
          </div>
        </Modal>
      )}
      <div
        className={`grid px-3.5 py-1.75 border-b border-t-line-soft text-xs items-center gap-2
          ${isStale || !hasLocalPath ? 'text-t-ink-soft' : 'text-t-ink'}`}
        style={{ gridTemplateColumns: '1.4fr 0.8fr 0.7fr 0.8fr 110px' }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <GitIcon size={11} />
          <span className="overflow-hidden text-ellipsis whitespace-nowrap font-medium">{repo.name}</span>
          {!hasLocalPath && <Chip>remote</Chip>}
          {isStale && <Chip>stale</Chip>}
        </div>
        <Mono size={11} soft>{hasLocalPath ? relTime(repo.lastOpenedAt) : 'not cloned'}</Mono>
        <Mono size={11} soft>{hasLocalPath ? fmtSize(repo.size) : '—'}</Mono>
        <span>
          {aiConfigured ? (
            <span className="inline-flex h-5 w-5 items-center justify-center text-t-ink" title="AI configured">
              <Check size={13} strokeWidth={2.4} aria-hidden="true" />
            </span>
          ) : (
            <span className="inline-flex h-5 w-5 items-center justify-center">
              <Mono size={11} soft>—</Mono>
            </span>
          )}
        </span>
        <div className="flex gap-1.5 justify-end items-center">
          {hasLocalPath ? (
            <>
              <button
                type="button"
                onClick={openInTerminal}
                className="inline-flex items-center justify-center cursor-pointer border border-t-line rounded-full w-5 h-5 hover:bg-t-panel"
                title="Open a terminal in this repository"
              >
                <Terminal size={11} aria-hidden="true" />
                <span className="sr-only">Open terminal</span>
              </button>
              <span
                onClick={openInEditor}
                className="inline-flex items-center gap-1 text-[10px] font-mono cursor-pointer border border-t-line rounded-full px-2 py-0.5 hover:bg-t-panel"
              >
                <SquareCode size={11} aria-hidden="true" />
                open
              </span>
            </>
          ) : cloning ? (
            <span
              className="inline-flex h-4 w-4 animate-spin rounded-full border"
              style={{ borderColor: 'var(--t-line)', borderTopColor: 'var(--t-ink)' }}
              title="Cloning"
            >
              <span className="sr-only">Cloning</span>
            </span>
          ) : (
            <span onClick={onClone} className="text-[10px] font-mono cursor-pointer">clone</span>
          )}
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            className="inline-flex items-center justify-center cursor-pointer text-t-ink-softer hover:text-[#e05252] w-5 h-5"
            title="Remove from list"
          >
            <Trash2 size={11} aria-hidden="true" />
          </button>
        </div>
      </div>
    </>
  )
}
