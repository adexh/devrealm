import React, { useEffect, useMemo, useState } from 'react'
import Fuse from 'fuse.js'
import { Copy } from 'lucide-react'
import { Box, Btn, Chip, Heading, Label, Mono } from '../../../components/ui'
import { FUZZY_SEARCH_THRESHOLD } from '../../../constants'

type MarketplaceEntry = {
  id: string
  source: { source: string; repo: string }
  installLocation: string
  lastUpdated: string
  pluginCount: number
}

type MarketplacePlugin = {
  name: string
  description: string
  category: string
  homepage: string
  sourceLabel: string
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

function formatName(id: string): string {
  return id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function GitHubIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className="shrink-0">
      <path
        fillRule="evenodd"
        fill="var(--t-ink-soft)"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
      />
    </svg>
  )
}

export function MarketplaceScreen({ embedded = false }: { embedded?: boolean }) {
  const [marketplaces, setMarketplaces] = useState<MarketplaceEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMarketplace, setSelectedMarketplace] = useState<MarketplaceEntry | null>(null)
  const [plugins, setPlugins] = useState<MarketplacePlugin[]>([])
  const [loadingPlugins, setLoadingPlugins] = useState(false)
  const [pluginsError, setPluginsError] = useState<string | null>(null)
  const [pluginQuery, setPluginQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')

  useEffect(() => {
    window.electronAPI.claude.listMarketplaces().then(data => {
      const sorted = [...data].sort((a, b) => {
        if (a.id === 'claude-plugins-official') return -1
        if (b.id === 'claude-plugins-official') return 1
        return 0
      })
      setMarketplaces(sorted)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  async function handleBrowsePlugins(marketplace: MarketplaceEntry) {
    setSelectedMarketplace(marketplace)
    setLoadingPlugins(true)
    setPluginsError(null)
    try {
      const data = await window.electronAPI.claude.fetchMarketplacePlugins(marketplace.source)
      setPlugins(data)
    } catch (error) {
      setPlugins([])
      setPluginsError(error instanceof Error ? error.message : 'Failed to load plugins.')
    } finally {
      setLoadingPlugins(false)
    }
  }

  function handleBack() {
    setSelectedMarketplace(null)
    setPlugins([])
    setPluginsError(null)
    setLoadingPlugins(false)
    setPluginQuery('')
    setSelectedCategory('all')
  }

  const pluginCategories = useMemo(() => {
    return ['all', ...new Set(plugins.map(plugin => plugin.category).filter(Boolean).sort((a, b) => a.localeCompare(b)))]
  }, [plugins])

  const filteredPlugins = useMemo(() => {
    const byCategory = selectedCategory === 'all'
      ? plugins
      : plugins.filter(plugin => plugin.category === selectedCategory)

    const trimmedQuery = pluginQuery.trim()
    if (!trimmedQuery) return byCategory

    const fuse = new Fuse(byCategory, {
      keys: ['name'],
      threshold: FUZZY_SEARCH_THRESHOLD,
      ignoreLocation: true,
    })

    return fuse.search(trimmedQuery).map(result => result.item)
  }, [pluginQuery, plugins, selectedCategory])

  return (
    <div
      className={`flex flex-col bg-t-bg text-t-ink text-[14px] font-system overflow-hidden ${embedded ? 'w-full h-full' : 'w-screen h-screen'}`}
    >
      {/* Header */}
      <div className="flex-none border-b border-t-line bg-t-panel px-6 py-4 flex items-center gap-3">
        {selectedMarketplace && (
          <Btn onClick={handleBack}>Back</Btn>
        )}
        <Heading size={16}>{selectedMarketplace ? formatName(selectedMarketplace.id) : 'Plugin Marketplace'}</Heading>
        <Mono size={11} soft>
          {selectedMarketplace ? '· browse plugins in this marketplace' : '· browse and discover Claude plugins'}
        </Mono>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {!selectedMarketplace && loading ? (
          <Mono size={12} soft>Loading marketplaces…</Mono>
        ) : !selectedMarketplace && marketplaces.length === 0 ? (
          <Box className="p-6 bg-t-panel text-center">
            <div className="text-[13px] text-t-ink-soft">No marketplaces found in <Mono size={11}>~/.claude/plugins/known_marketplaces.json</Mono></div>
          </Box>
        ) : selectedMarketplace ? (
          loadingPlugins ? (
            <Mono size={12} soft>Loading plugins…</Mono>
          ) : pluginsError ? (
            <div className="text-[12px] text-[#e05252] px-3 py-2 border border-[#e05252] rounded-[3px]">
              {pluginsError}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <Box className="p-4 bg-t-panel">
                <div className="grid grid-cols-[minmax(0,1fr)_180px] gap-3 items-end">
                  <div className="flex flex-col gap-1.5">
                    <Label>Filter Plugins</Label>
                    <input
                      value={pluginQuery}
                      onChange={e => setPluginQuery(e.target.value)}
                      placeholder="Search by plugin name…"
                      className="h-8 border border-t-line rounded px-2.5 text-[13px] bg-t-bg text-t-ink outline-none w-full box-border"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Category</Label>
                    <select
                      value={selectedCategory}
                      onChange={e => setSelectedCategory(e.target.value)}
                      className="h-8 border border-t-line rounded px-2.5 text-[13px] bg-t-bg text-t-ink outline-none w-full box-border"
                    >
                      {pluginCategories.map(category => (
                        <option key={category} value={category}>
                          {category === 'all' ? 'All categories' : category}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </Box>

              {filteredPlugins.length === 0 ? (
                <Box className="p-6 bg-t-panel text-center">
                  <div className="text-[13px] text-t-ink-soft">No plugins match the current filters.</div>
                </Box>
              ) : (
                <div className="grid grid-cols-2 gap-4 items-start">
                  {filteredPlugins.map((plugin, index) => (
                    <PluginTile key={`${plugin.name}-${index}`} plugin={plugin} marketplaceName={selectedMarketplace.id} />
                  ))}
                </div>
              )}
            </div>
          )
        ) : (
          <div className="grid grid-cols-2 gap-4 items-start">
            {marketplaces.map(mp => (
              <MarketplaceTile key={mp.id} marketplace={mp} onBrowsePlugins={handleBrowsePlugins} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function MarketplaceTile({ marketplace: mp, onBrowsePlugins }: { marketplace: MarketplaceEntry; onBrowsePlugins: (marketplace: MarketplaceEntry) => void }) {
  return (
    <Box className="p-4 bg-t-panel flex flex-col gap-3">
      {/* Title row */}
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <Heading size={14}>{formatName(mp.id)}</Heading>
          <Mono size={10} soft className="block mt-0.5 truncate">{mp.id}</Mono>
        </div>
        <Chip accent>{mp.source.source}</Chip>
      </div>

      {/* Meta rows */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <Label>Repository</Label>
          <div className="flex items-center gap-1.5 ml-auto">
            <GitHubIcon size={12} />
            <Mono size={11}>{mp.source.repo}</Mono>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Label>Last updated</Label>
          <Mono size={11} soft className="ml-auto">{formatDate(mp.lastUpdated)}</Mono>
        </div>

        {mp.pluginCount > 0 && (
          <div className="flex items-center gap-2">
            <Label>Plugins</Label>
            <span className="ml-auto text-[11px] text-t-ink-soft bg-t-bg border border-t-line rounded-full px-2 py-px">
              {mp.pluginCount}
            </span>
          </div>
        )}
      </div>

      {/* Install location */}
      <div className="border-t border-t-line pt-2.5">
        <Mono size={10} soft className="block truncate">{mp.installLocation}</Mono>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Btn full onClick={() => { void onBrowsePlugins(mp) }}>Browse Plugins</Btn>
      </div>
    </Box>
  )
}

function PluginTile({ plugin, marketplaceName }: { plugin: MarketplacePlugin; marketplaceName: string }) {
  const [copied, setCopied] = useState(false)
  const installCommand = `claude plugin install ${plugin.name}@${marketplaceName}`

  async function handleCopyCommand() {
    await navigator.clipboard.writeText(installCommand)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Box className="p-4 bg-t-panel flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <Heading size={14}>{plugin.name}</Heading>
        </div>
        <Chip>{plugin.category}</Chip>
      </div>

      <div className="text-[12px] text-t-ink-soft leading-snug min-h-12">
        {plugin.description || '—'}
      </div>

      {(plugin.homepage || plugin.sourceLabel) && (
        <div className="border-t border-t-line pt-2.5">
          <Mono size={10} soft className="block truncate">{plugin.homepage || plugin.sourceLabel}</Mono>
        </div>
      )}

      <div className="flex items-stretch gap-2 min-w-0">
        <div className="flex-1 min-w-0 border border-t-line rounded bg-t-bg px-2.5 py-1.5">
          <Mono size={11} className="block truncate">{installCommand}</Mono>
        </div>
        <Btn onClick={() => { void handleCopyCommand() }} className="px-2.5">
          <Copy size={14} aria-hidden="true" />
          {copied ? 'Copied' : 'Copy'}
        </Btn>
      </div>
    </Box>
  )
}
