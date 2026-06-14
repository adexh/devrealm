import type { McpRegistryResponse } from '../types/mcpRegistry'

export function fetchMcpRegistry(search?: string, cursor?: string): Promise<McpRegistryResponse> {
  return window.electronAPI.claude.fetchMcpRegistry(search, cursor)
}
