import { create } from 'zustand'
import type { Workspace, Repo } from '../../shared/types'

interface WorkspaceState {
  workspaces: Workspace[]
  repos: Repo[]
  loading: boolean
  fetch: () => Promise<void>
}

const { workspaces: initialWorkspaces, repos: initialRepos } = window.electronAPI.initialData

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  workspaces: initialWorkspaces,
  repos: initialRepos,
  loading: false,
  fetch: async () => {
    const { workspaces, repos } = await window.electronAPI.workspaces.snapshot()
    set({ workspaces, repos })
  },
}))
