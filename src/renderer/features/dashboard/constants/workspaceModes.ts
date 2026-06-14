import type { WorkspaceCreateMode } from '../types/workspaceMode'

export const WORKSPACE_CREATE_MODES: WorkspaceCreateMode[] = ['create', 'open', 'import']

export function workspaceCreateModeLabel(mode: WorkspaceCreateMode): string {
  if (mode === 'create') return 'New workspace'
  if (mode === 'open') return 'Open from folder'
  return 'Import'
}
