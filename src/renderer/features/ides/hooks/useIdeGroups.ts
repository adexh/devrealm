import { useMemo } from 'react'
import type { IdeSnapshot } from '../../../../shared/ide'
import { useWorkspaceStore } from '../../../stores/workspaceStore'
import { basename, resolveRepoPath, shortenHome } from '../../../utils/paths'
import { OTHER_GROUP_KEY } from '../constants'
import type { IdeUnopenedRepo, IdeWindowGroup, IdeWindowView } from '../types'

/**
 * Windows grouped by the DevRealm workspace whose repo they hold, each group
 * carrying the repos of that workspace that have no window. Workspaces with
 * windows come first; the untracked remainder closes the list.
 */
export function useIdeGroups(snapshot: IdeSnapshot | null): IdeWindowGroup[] {
  const workspaces = useWorkspaceStore(state => state.workspaces)
  const repos = useWorkspaceStore(state => state.repos)

  return useMemo(() => {
    const windows = snapshot?.windows ?? []
    const repoById = new Map(repos.map(repo => [repo.id, repo]))
    const openFolders = new Set(windows.flatMap(win => win.folderPath ? [win.folderPath] : []))

    const groups: IdeWindowGroup[] = workspaces.map(workspace => {
      const own = windows
        .filter(win => win.workspaceId === workspace.id)
        .map(win => toView(win, repoById.get(win.repoId ?? '')?.name ?? null))
      const unopened: IdeUnopenedRepo[] = repos
        .filter(repo => repo.workspaceId === workspace.id)
        .flatMap(repo => {
          const path = resolveRepoPath(repo.path, workspace)
          return path && !openFolders.has(path) ? [{ repo, path }] : []
        })
      return { key: workspace.id, workspaceId: workspace.id, name: workspace.name, windows: own, unopened }
    })

    const other = windows
      .filter(win => !win.workspaceId || !workspaces.some(workspace => workspace.id === win.workspaceId))
      .map(win => toView(win, null))

    const ordered = groups
      .filter(group => group.windows.length > 0 || group.unopened.length > 0)
      .sort((a, b) => b.windows.length - a.windows.length)
    if (other.length > 0) {
      ordered.push({ key: OTHER_GROUP_KEY, workspaceId: null, name: 'Other windows', windows: other, unopened: [] })
    }
    return ordered
  }, [snapshot, repos, workspaces])
}

function toView(win: IdeSnapshot['windows'][number], repoName: string | null): IdeWindowView {
  return {
    ...win,
    repoName,
    folderLabel: win.folderPath ? shortenHome(win.folderPath) : null,
    rootName: win.rootName ?? (win.folderPath ? basename(win.folderPath) : null),
  }
}
