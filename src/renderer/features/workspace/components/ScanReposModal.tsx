import { useEffect, useState } from 'react'
import { GitIcon, Modal, Btn, Mono } from '../../../components/ui'
import { scanWorkspaceForRepos, addRepo } from '../ipc/repos'
import type { Workspace, Repo } from '../../../../shared/types'

type ScannedRepo = { name: string; path: string }

export function ScanReposModal({ workspace, existingRepos, onClose, onAdded }: {
  workspace: Workspace
  existingRepos: Repo[]
  onClose: () => void
  onAdded: () => void
}) {
  const [status, setStatus] = useState<'scanning' | 'done' | 'error'>('scanning')
  const [found, setFound] = useState<ScannedRepo[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    if (!workspace.rootPath) {
      setErrorMsg('No workspace path configured.')
      setStatus('error')
      return
    }
    const existingPaths = existingRepos.map(r => r.path).filter(Boolean)
    scanWorkspaceForRepos(workspace.rootPath, existingPaths)
      .then(repos => {
        setFound(repos)
        setStatus('done')
      })
      .catch(e => {
        setErrorMsg(e instanceof Error ? e.message : 'Scan failed')
        setStatus('error')
      })
  }, [])

  async function handleAdd() {
    if (!workspace.rootPath || found.length === 0) return
    setAdding(true)
    try {
      await Promise.all(found.map(repo => addRepo({ repoPath: repo.path, workspaceId: workspace.id })))
      onAdded()
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Failed to add repositories')
      setStatus('error')
      setAdding(false)
    }
  }

  return (
    <Modal title="Scan for repositories" onClose={onClose} width={440}>
      <div className="flex flex-col gap-3">
        {status === 'scanning' && (
          <div className="flex items-center gap-2.5 py-4 text-[13px] text-t-ink-soft">
            <span
              className="inline-flex h-4 w-4 shrink-0 animate-spin rounded-full border"
              style={{ borderColor: 'var(--t-line)', borderTopColor: 'var(--t-ink)' }}
              aria-hidden="true"
            />
            Scanning…
          </div>
        )}

        {status === 'error' && (
          <div className="text-[12px] text-[#e05252] px-2 py-2 border border-[#e05252] rounded-[3px]">
            {errorMsg}
          </div>
        )}

        {status === 'done' && found.length === 0 && (
          <div className="py-4 text-center text-[13px] text-t-ink-soft">
            No new repositories found.
          </div>
        )}

        {status === 'done' && found.length > 0 && (
          <>
            <div className="text-[12px] text-t-ink-soft">
              Found {found.length} new {found.length === 1 ? 'repository' : 'repositories'} in <Mono size={11} className="inline">{workspace.rootPath}</Mono>:
            </div>
            <div className="flex flex-col divide-y divide-t-line-soft border border-t-line-soft rounded-[3px] overflow-hidden max-h-60 overflow-y-auto">
              {found.map(repo => (
                <div key={repo.path} className="flex items-center gap-2 px-3 py-2 bg-t-bg text-[12px]">
                  <GitIcon size={11} />
                  <span className="font-medium truncate flex-1">{repo.name}</span>
                  <Mono size={10} soft className="truncate max-w-[180px]">{repo.path}</Mono>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="flex gap-2 pt-0.5">
          {status === 'done' && found.length > 0 && (
            <Btn primary onClick={handleAdd} style={{ opacity: adding ? 0.5 : 1 }}>
              {adding ? 'Adding…' : `Add ${found.length === 1 ? 'repository' : 'all'}`}
            </Btn>
          )}
          <Btn onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </Modal>
  )
}
