import { useMemo } from 'react'
import Fuse from 'fuse.js'
import { useWorkspaceStore } from '../../../stores/workspaceStore'
import { FUZZY_SEARCH_THRESHOLD } from '../../../constants'
import { useTerminalStore } from './useTerminalStore'
import type { LaunchTarget, LaunchTargetGroup } from '../types'

/**
 * Builds the repo drawer's tree from the workspaces and repos the app already
 * tracks, then applies the drawer's filter chip and search box.
 */
export function useLaunchTargets(): { groups: LaunchTargetGroup[]; total: number; openCount: number } {
  const workspaces = useWorkspaceStore(state => state.workspaces)
  const repos = useWorkspaceStore(state => state.repos)
  const sessions = useTerminalStore(state => state.sessions)
  const query = useTerminalStore(state => state.drawerQuery)
  const filter = useTerminalStore(state => state.drawerFilter)

  const allTargets = useMemo<LaunchTarget[]>(() => repos.map(repo => ({
    id: repo.id,
    workspaceId: repo.workspaceId,
    name: repo.name,
    path: repo.path,
    kind: 'repo' as const,
    openCount: 0,
    hasLocalPath: Boolean(repo.path),
  })), [repos])

  const withOpenCounts = useMemo<LaunchTarget[]>(() => allTargets.map(target => ({
    ...target,
    openCount: sessions.filter(session => session.repoId === target.id).length,
  })), [allTargets, sessions])

  const fuse = useMemo(
    () => new Fuse(withOpenCounts, { keys: ['name', 'path'], threshold: FUZZY_SEARCH_THRESHOLD }),
    [withOpenCounts]
  )

  const matched = useMemo(() => {
    const trimmed = query.trim()
    const base = trimmed ? fuse.search(trimmed).map(result => result.item) : withOpenCounts
    if (filter === 'open') return base.filter(target => target.openCount > 0)
    if (filter === 'recent') {
      const recentRepoIds = new Set(
        [...sessions].sort((a, b) => b.lastActiveAt - a.lastActiveAt).map(session => session.repoId)
      )
      return base.filter(target => recentRepoIds.has(target.id))
    }
    return base
  }, [fuse, query, filter, withOpenCounts, sessions])

  const groups = useMemo<LaunchTargetGroup[]>(() => {
    const byWorkspace: LaunchTargetGroup[] = []
    for (const workspace of workspaces) {
      const targets = matched.filter(target => target.workspaceId === workspace.id)
      if (targets.length === 0) continue
      byWorkspace.push({
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        targets: targets.sort((a, b) => a.name.localeCompare(b.name)),
      })
    }
    return byWorkspace
  }, [workspaces, matched])

  return {
    groups,
    total: withOpenCounts.length,
    openCount: withOpenCounts.filter(target => target.openCount > 0).length,
  }
}
