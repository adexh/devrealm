import { useEffect, useState } from 'react'
import type { Workspace } from '../../../../shared/types'
import { AIConfigEmpty } from './AIConfigEmpty'
import { AIConfigPopulated } from './AIConfigPopulated'
import { useWorkspaceStore } from '../../../stores/workspaceStore'
import { useNavigationStore } from '../../../stores/navigationStore'
import { GLOBAL_AI_CONFIG_ID, GLOBAL_AI_CONFIG_LABEL } from '../constants/scope'
import { getUserHome } from '../ipc/userScope'

export function AIConfigScreen() {
  const { workspaces, repos } = useWorkspaceStore()
  const { aiConfigWorkspaceId, setAiConfigWorkspaceId } = useNavigationStore()
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null)
  const [userHome, setUserHome] = useState<string | null>(null)
  const userScope = aiConfigWorkspaceId === GLOBAL_AI_CONFIG_ID

  useEffect(() => {
    if (userScope && !userHome) void getUserHome().then(setUserHome)
  }, [userScope, userHome])

  const userWorkspace: Workspace | null = userScope && userHome
    ? { id: GLOBAL_AI_CONFIG_ID, name: GLOBAL_AI_CONFIG_LABEL, rootPath: userHome, createdAt: 0 }
    : null
  const workspace = userWorkspace ?? workspaces.find(w => w.id === aiConfigWorkspaceId) ?? null
  const workspaceRepos = workspace && !userScope
    ? repos.filter(repo => repo.workspaceId === workspace.id)
    : []
  const selectedRepo = workspaceRepos.find(r => r.id === selectedRepoId) ?? null

  function handleSelectWorkspace(id: string | null) {
    setSelectedRepoId(null)
    setAiConfigWorkspaceId(id)
  }

  if (userScope && !userWorkspace) return null

  return workspace
    ? <AIConfigPopulated
        key={workspace.id}
        workspace={workspace}
        repos={workspaceRepos}
        selectedRepo={selectedRepo}
        onSelectRepo={setSelectedRepoId}
        onSelect={handleSelectWorkspace}
        userScope={userScope}
      />
    : <AIConfigEmpty onSelect={handleSelectWorkspace} />
}
