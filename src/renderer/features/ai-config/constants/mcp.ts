import type { McpServerScope } from '../../../../shared/types'

export const MCP_SCOPE_LABELS: Record<McpServerScope, { label: string; hint: string }> = {
  local: { label: 'Local', hint: 'Only you, only this folder (~/.claude.json)' },
  project: { label: 'Project', hint: 'Shared with the team (.mcp.json)' },
  user: { label: 'User', hint: 'Only you, every project (~/.claude.json)' },
  plugin: { label: 'Plugin', hint: 'Comes with an enabled plugin' },
}
