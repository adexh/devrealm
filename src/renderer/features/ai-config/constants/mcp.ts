import type { McpServer, McpServerScope } from '../../../../shared/types'

export const MCP_SCOPE_LABELS: Record<McpServerScope, { label: string; hint: string }> = {
  local: { label: 'Local', hint: 'Only you, only when Claude runs in the folder it was added in (~/.claude.json)' },
  project: { label: 'Project', hint: 'Shared with the team (.mcp.json)' },
  user: { label: 'User', hint: 'Only you, every project (~/.claude.json)' },
  plugin: { label: 'Plugin', hint: 'Comes with an enabled plugin' },
}

export function mcpAppliesTo(server: McpServer): string {
  if (server.scope === 'local') return server.folder ? `./${server.folder}` : 'This folder'
  if (server.scope === 'project') return 'This folder'
  if (server.scope === 'user') return 'Everywhere'
  return 'Where the plugin is enabled'
}
