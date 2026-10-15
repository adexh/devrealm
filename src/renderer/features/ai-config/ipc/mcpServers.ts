import type { McpServer } from '../../../../shared/types'

export function listMcpServers(rootPath: string): Promise<McpServer[]> {
  return window.electronAPI.claude.mcpServers(rootPath)
}
