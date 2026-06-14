import { useEffect, useRef, useState } from 'react'
import { Box, Btn, Heading, Label, Mono } from '../../../components/ui'
import { fetchMcpRegistry } from '../ipc/mcpRegistry'
import type { RegistryMcpServer } from '../types/mcpRegistry'
import { RegistryMcpServerTile } from './RegistryMcpServerTile'

export function McpRegistryScreen() {
  const [registryServers, setRegistryServers] = useState<RegistryMcpServer[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const requestIdRef = useRef(0)

  async function loadRegistryServers(cursor?: string, search = query) {
    const requestId = ++requestIdRef.current
    if (cursor) setLoadingMore(true); else setLoading(true)
    setError(null)
    try {
      const data = await fetchMcpRegistry(search.trim(), cursor)
      if (requestId !== requestIdRef.current) return
      setRegistryServers(prev => cursor ? [...prev, ...data.servers] : data.servers)
      setNextCursor(data.nextCursor)
    } catch (err) {
      if (requestId !== requestIdRef.current) return
      setError(err instanceof Error ? err.message : 'Failed to load MCP registry.')
    } finally {
      if (requestId !== requestIdRef.current) return
      setLoading(false)
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void loadRegistryServers(undefined, query)
    }, 250)
    return () => window.clearTimeout(handle)
  }, [query])

  return (
    <div className="flex flex-col bg-t-bg text-t-ink text-[14px] font-system overflow-hidden w-full h-full">
      <div className="flex-none border-b border-t-line bg-t-panel px-6 py-4 flex items-center gap-3">
        <Heading size={16}>MCP Registry</Heading>
        <Mono size={11} soft>· browse registry.modelcontextprotocol.io servers</Mono>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex flex-col gap-4">
          <Box className="p-4 bg-t-panel">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-end">
              <div className="flex flex-col gap-1.5">
                <Label>Filter MCP Servers</Label>
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search registry servers…"
                  className="h-8 border border-t-line rounded px-2.5 text-[13px] bg-t-bg text-t-ink outline-none w-full box-border"
                />
              </div>
              <span className="text-[11px] text-t-ink-soft bg-t-bg border border-t-line rounded-full px-2 py-1">
                {registryServers.length} shown
              </span>
            </div>
          </Box>

          {loading ? (
            <Mono size={12} soft>Loading MCP servers…</Mono>
          ) : error ? (
            <div className="text-[12px] text-[#e05252] px-3 py-2 border border-[#e05252] rounded-[3px]">
              {error}
            </div>
          ) : (
            <>
            {registryServers.length === 0 ? (
              <Box className="p-6 bg-t-panel text-center">
                <div className="text-[13px] text-t-ink-soft">No MCP servers match the current search.</div>
              </Box>
            ) : (
              <div className="grid grid-cols-2 gap-4 items-start">
                {registryServers.map((server, index) => (
                  <RegistryMcpServerTile key={`${server.name}-${server.version}-${index}`} server={server} />
                ))}
              </div>
            )}

            {nextCursor && (
              <div className="flex justify-center pt-1">
                <Btn
                  onClick={() => { if (!loadingMore) void loadRegistryServers(nextCursor, query) }}
                  style={{ opacity: loadingMore ? 0.55 : 1 }}
                >
                  {loadingMore ? 'Loading…' : 'Load More'}
                </Btn>
              </div>
            )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
