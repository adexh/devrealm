import { useMemo } from 'react'
import type { IdeSnapshot } from '../../../../shared/ide'
import { useWorkspaceStore } from '../../../stores/workspaceStore'
import { basename, shortenHome } from '../../../utils/paths'
import { OTHER_GROUP_KEY } from '../constants'
import type { IdeWindowGroup, IdeWindowView } from '../types'

/**
 * Windows grouped by the DevRealm workspace whose repo they hold. Only what is
 * open appears: a workspace with no window has no group. Windows no workspace
 * tracks close the list.
 */
export function useIdeGroups(snapshot: IdeSnapshot | null): IdeWindowGroup[] {
  const workspaces = useWorkspaceStore(state => state.workspaces)
  const repos = useWorkspaceStore(state => state.repos)

  return useMemo(() => {
    const windows = snapshot?.windows ?? []
    const repoById = new Map(repos.map(repo => [repo.id, repo]))

    const groups: IdeWindowGroup[] = workspaces.flatMap(workspace => {
      const own = windows
        .filter(win => win.workspaceId === workspace.id)
        .map(win => toView(win, repoById.get(win.repoId ?? '')?.name ?? null))
      return own.length > 0 ? [{ key: workspace.id, workspaceId: workspace.id, name: workspace.name, windows: own }] : []
    })

    const other = windows
      .filter(win => !win.workspaceId || !workspaces.some(workspace => workspace.id === win.workspaceId))
      .map(win => toView(win, null))

    const ordered = groups.sort((a, b) => b.windows.length - a.windows.length)
    if (other.length > 0) {
      ordered.push({ key: OTHER_GROUP_KEY, workspaceId: null, name: 'Other windows', windows: other })
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
