import { useState } from 'react'
import type { Repo } from '../../../../shared/types'
import { AIConfigEmpty } from './AIConfigEmpty'
import { AIConfigPopulated } from './AIConfigPopulated'
import { useWorkspaceStore } from '../../../stores/workspaceStore'
import { useNavigationStore } from '../../../stores/navigationStore'

export function AIConfigScreen() {
  const { workspaces, repos } = useWorkspaceStore()
  const { aiConfigWorkspaceId, setAiConfigWorkspaceId } = useNavigationStore()
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null)

  const workspace = workspaces.find(w => w.id === aiConfigWorkspaceId) ?? null
  const workspaceRepos = workspace
    ? repos.filter(repo => repo.workspaceId === workspace.id)
    : []
  const selectedRepo = workspaceRepos.find(r => r.id === selectedRepoId) ?? null

  function handleSelectWorkspace(id: string | null) {
    setSelectedRepoId(null)
    setAiConfigWorkspaceId(id)
  }

  return workspace
    ? <AIConfigPopulated
        workspace={workspace}
        repos={workspaceRepos}
        selectedRepo={selectedRepo}
        onSelectRepo={setSelectedRepoId}
        onSelect={handleSelectWorkspace}
      />
    : <AIConfigEmpty onSelect={handleSelectWorkspace} />
}
