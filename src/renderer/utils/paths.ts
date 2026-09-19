import type { Workspace } from '../../shared/types'

export function isAbsolutePath(value: string): boolean {
  return value.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('\\\\')
}

/** A repo path as stored may be relative to its workspace root; null when it cannot be made absolute. */
export function resolveRepoPath(repoPath: string, workspace?: Workspace | null): string | null {
  const trimmedPath = repoPath.trim()
  if (!trimmedPath) return null
  if (isAbsolutePath(trimmedPath)) return trimmedPath
  if (!workspace?.rootPath) return null
  return `${workspace.rootPath.replace(/[\\/]+$/, '')}/${trimmedPath.replace(/^[\\/]+/, '')}`
}

export function basename(value: string): string {
  const trimmed = value.replace(/[\\/]+$/, '')
  const index = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  return index === -1 ? trimmed : trimmed.slice(index + 1)
}

export function shortenHome(absolutePath: string): string {
  const match = absolutePath.match(/^\/Users\/[^/]+\/(.*)$|^\/home\/[^/]+\/(.*)$/)
  return match ? `~/${match[1] ?? match[2]}` : absolutePath
}
