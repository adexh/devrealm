import { useMemo } from 'react'
import Fuse from 'fuse.js'
import { useWorkspaceStore } from '../../../stores/workspaceStore'
import { FUZZY_SEARCH_THRESHOLD } from '../../../constants'
import { useTerminalStore } from '../../../stores/terminalStore'
import type { LaunchTarget } from '../types'

/**
 * Repos in the selected workspace, after the drawer's filter chip and search.
 * Returns nothing until a workspace is picked, which is what keeps the drawer
 * empty on the landing screen.
 */
export function useLaunchTargets(): { targets: LaunchTarget[]; total: number; openCount: number } {
  const repos = useWorkspaceStore(state => state.repos)
  const activeWorkspaceId = useTerminalStore(state => state.activeWorkspaceId)
  const sessions = useTerminalStore(state => state.sessions)
  const query = useTerminalStore(state => state.drawerQuery)
  const filter = useTerminalStore(state => state.drawerFilter)

  const scoped = useMemo<LaunchTarget[]>(() => {
    if (!activeWorkspaceId) return []
    return repos
      .filter(repo => repo.workspaceId === activeWorkspaceId)
      .map(repo => ({
        id: repo.id,
        workspaceId: repo.workspaceId,
        name: repo.name,
        path: repo.path,
        kind: 'repo' as const,
        openCount: sessions.filter(session => session.repoId === repo.id).length,
        hasLocalPath: Boolean(repo.path),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [repos, activeWorkspaceId, sessions])

  const fuse = useMemo(
    () => new Fuse(scoped, { keys: ['name', 'path'], threshold: FUZZY_SEARCH_THRESHOLD }),
    [scoped]
  )

  const targets = useMemo(() => {
    const trimmed = query.trim()
    const base = trimmed ? fuse.search(trimmed).map(result => result.item) : scoped
    if (filter === 'open') return base.filter(target => target.openCount > 0)
    if (filter === 'recent') {
      const recent = new Set(
        [...sessions].sort((a, b) => b.lastActiveAt - a.lastActiveAt).map(session => session.repoId)
      )
      return base.filter(target => recent.has(target.id))
    }
    return base
  }, [fuse, query, filter, scoped, sessions])

  return {
    targets,
    total: scoped.length,
    openCount: scoped.filter(target => target.openCount > 0).length,
  }
}
