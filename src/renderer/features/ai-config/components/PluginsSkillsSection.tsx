import React, { useState } from 'react'
import { Box, Btn, Chip, Heading, Label, Mono, AIIcon, InfoPopover, Modal } from '../../../components/ui'
import { MarketplaceScreen } from '../../marketplace'
import { McpRegistryScreen } from './McpRegistryScreen'
import { SkillCreatorModal } from './SkillCreatorModal'
import { removePlugin, setPluginEnabled } from '../ipc/plugins'

export type McpServer = {
  name: string
  type: string
  command: string
}

export type Plugin = {
  id: string
  name: string
  version: string
  description: string
  enabled: boolean
  skills: { name: string; description: string }[]
}

type SkillRow = { name: string; description: string; pluginId: string; pluginName: string }

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!on)}
      className="relative rounded-full cursor-pointer shrink-0 transition-colors"
      style={{ width: 30, height: 17, background: on ? 'var(--t-accent-bg)' : 'var(--t-line)' }}
    >
      <div
        className="absolute top-0.5 rounded-full bg-white"
        style={{ width: 13, height: 13, transition: 'transform 0.15s', transform: `translateX(${on ? 15 : 2}px)` }}
      />
    </div>
  )
}

function ScrollTable({ children, count }: { children: React.ReactNode; count: number }) {
  return (
    <div className="border border-t-line rounded overflow-hidden">
      <div className="overflow-y-auto" style={{ maxHeight: '13rem' }}>
        <table className="w-full text-[11px] border-collapse">{children}</table>
      </div>
      {count > 5 && (
        <div className="px-2.5 py-1 border-t border-t-line bg-t-panel">
          <Mono size={10} soft>{count} items · scroll to see all</Mono>
        </div>
      )}
    </div>
  )
}

export function PluginsSkillsSection({
  plugins,
  mcpServers,
  loading,
  workspacePath,
  onRefresh,
}: {
  plugins: Plugin[]
  mcpServers: McpServer[]
  loading: boolean
  workspacePath: string
  onRefresh: () => Promise<void>
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [disabledSkills, setDisabledSkills] = useState<Set<string>>(new Set())
  const [showMarketplace, setShowMarketplace] = useState(false)
  const [showMcpRegistry, setShowMcpRegistry] = useState(false)
  const [showSkillCreator, setShowSkillCreator] = useState(false)

  const allSkills: SkillRow[] = plugins.flatMap(p =>
    p.skills.map(s => ({ ...s, pluginId: p.id, pluginName: p.name }))
  )

  async function handleTogglePlugin(pluginId: string, currentlyEnabled: boolean) {
    setBusy(pluginId)
    try {
      await setPluginEnabled({ workspacePath, pluginId, enabled: !currentlyEnabled })
      await onRefresh()
    } finally {
      setBusy(null)
    }
  }

  async function handleRemovePlugin(pluginId: string) {
    setBusy(pluginId)
    try {
      await removePlugin({ workspacePath, pluginId })
      await onRefresh()
    } finally {
      setBusy(null)
    }
  }

  function handleToggleSkill(key: string, on: boolean) {
    setDisabledSkills(prev => {
      const next = new Set(prev)
      if (on) next.delete(key); else next.add(key)
      return next
    })
  }

  function handleRemoveSkill(key: string) {
    setDisabledSkills(prev => new Set(prev).add(key))
  }

  return (
    <Box className="p-4 bg-t-panel">
      <div className="flex items-center gap-2">
        <AIIcon size={15} />
        <Heading size={14}>Plugins, Skills & Tools</Heading>
        <InfoPopover
          title="Plugins, Skills & Tools"
          description={(
            <>
              Plugins are enabled per workspace via <Mono size={11}>.claude/settings.json</Mono>. Skills are contributed by installed plugins and MCP servers expose external tools to Claude sessions.
            </>
          )}
        />
      </div>

      {loading && <Mono size={12} soft className="block mt-3">Loading plugins…</Mono>}

      {!loading && (
        <div className="mt-3 grid grid-cols-3 gap-4 items-start">

          {/* ── Plugins ── */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Label>Plugins</Label>
              {plugins.length > 0 && (
                <span className="text-[10px] text-t-ink-soft bg-t-bg border border-t-line rounded-full px-2 py-px ml-auto">
                  {plugins.length}
                </span>
              )}
            </div>

            {plugins.length === 0 ? (
              <div className="text-[11px] text-t-ink-soft py-1">No plugins enabled for this workspace.</div>
            ) : (
              <ScrollTable count={plugins.length}>
                <thead className="sticky top-0 bg-t-panel">
                  <tr className="border-b border-t-line">
                    <th className="text-left px-2.5 py-2 font-medium text-t-ink-soft">Plugin</th>
                    <th className="text-left px-2.5 py-2 font-medium text-t-ink-soft">Description</th>
                    <th className="px-2.5 py-2 font-medium text-t-ink-soft text-center">On</th>
                    <th className="px-2.5 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {plugins.map((plugin, i) => {
                    const isBusy = busy === plugin.id
                    const isOn = plugin.enabled
                    return (
                      <tr
                        key={plugin.id}
                        className={`border-b border-t-line last:border-b-0 ${i % 2 === 0 ? 'bg-t-bg' : ''}`}
                        style={{ opacity: isBusy ? 0.5 : 1 }}
                      >
                        <td className="px-2.5 py-2 max-w-28">
                          <div className="font-medium text-t-ink truncate">{plugin.name}</div>
                          <Chip className="mt-0.5">{plugin.version}</Chip>
                        </td>
                        <td className="px-2.5 py-2 text-t-ink-soft max-w-40">
                          <span className="block truncate">{plugin.description || '—'}</span>
                        </td>
                        <td className="px-2.5 py-2 text-center">
                          <Toggle on={isOn} onChange={() => handleTogglePlugin(plugin.id, isOn)} />
                        </td>
                        <td className="px-2.5 py-2 whitespace-nowrap">
                          <Btn onClick={() => handleRemovePlugin(plugin.id)}>Remove</Btn>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </ScrollTable>
            )}

            <Btn onClick={() => setShowMarketplace(true)}>Browse Marketplace</Btn>
          </div>

          {/* ── Skills ── */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Label>Skills</Label>
              {allSkills.length > 0 && (
                <span className="text-[10px] text-t-ink-soft bg-t-bg border border-t-line rounded-full px-2 py-px ml-auto">
                  {allSkills.length}
                </span>
              )}
            </div>

            {allSkills.length === 0 ? (
              <div className="text-[11px] text-t-ink-soft py-1">No skills available. Install a plugin that contributes skills.</div>
            ) : (
              <ScrollTable count={allSkills.length}>
                <thead className="sticky top-0 bg-t-panel">
                  <tr className="border-b border-t-line">
                    <th className="text-left px-2.5 py-2 font-medium text-t-ink-soft">Skill</th>
                    <th className="text-left px-2.5 py-2 font-medium text-t-ink-soft">Description</th>
                    <th className="px-2.5 py-2 font-medium text-t-ink-soft text-center">On</th>
                    <th className="px-2.5 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {allSkills.map((skill, i) => {
                    const key = `${skill.pluginId}:${skill.name}`
                    const isOn = !disabledSkills.has(key)
                    return (
                      <tr
                        key={key}
                        className={`border-b border-t-line last:border-b-0 ${i % 2 === 0 ? 'bg-t-bg' : ''}`}
                      >
                        <td className="px-2.5 py-2 max-w-28">
                          <div className="font-medium text-t-ink truncate">/{skill.name}</div>
                          <Mono size={10} soft className="block truncate">{skill.pluginName}</Mono>
                        </td>
                        <td className="px-2.5 py-2 text-t-ink-soft max-w-40">
                          <span className="block truncate">{skill.description || '—'}</span>
                        </td>
                        <td className="px-2.5 py-2 text-center">
                          <Toggle on={isOn} onChange={v => handleToggleSkill(key, v)} />
                        </td>
                        <td className="px-2.5 py-2 whitespace-nowrap">
                          <Btn onClick={() => handleRemoveSkill(key)}>Remove</Btn>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </ScrollTable>
            )}

            <Btn onClick={() => setShowSkillCreator(true)}>Create Skill</Btn>
          </div>

          {/* ── MCP Servers ── */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Label>MCP Servers</Label>
              {mcpServers.length > 0 && (
                <span className="text-[10px] text-t-ink-soft bg-t-bg border border-t-line rounded-full px-2 py-px ml-auto">
                  {mcpServers.length}
                </span>
              )}
            </div>

            {mcpServers.length === 0 ? (
              <div className="text-[11px] text-t-ink-soft py-1">No MCP servers configured for this workspace.</div>
            ) : (
              <ScrollTable count={mcpServers.length}>
                <thead className="sticky top-0 bg-t-panel">
                  <tr className="border-b border-t-line">
                    <th className="text-left px-2.5 py-2 font-medium text-t-ink-soft">Name</th>
                    <th className="text-left px-2.5 py-2 font-medium text-t-ink-soft">Type</th>
                    <th className="text-left px-2.5 py-2 font-medium text-t-ink-soft">Command / URL</th>
                  </tr>
                </thead>
                <tbody>
                  {mcpServers.map((server, i) => (
                    <tr
                      key={server.name}
                      className={`border-b border-t-line last:border-b-0 ${i % 2 === 0 ? 'bg-t-bg' : ''}`}
                    >
                      <td className="px-2.5 py-2 max-w-24">
                        <span className="block font-medium text-t-ink truncate">{server.name}</span>
                      </td>
                      <td className="px-2.5 py-2">
                        <Chip>{server.type}</Chip>
                      </td>
                      <td className="px-2.5 py-2 max-w-40">
                        <Mono size={10} className="block truncate">{server.command}</Mono>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </ScrollTable>
            )}

            <Btn onClick={() => setShowMcpRegistry(true)}>Browse MCP</Btn>
          </div>
        </div>
      )}

      {showMarketplace && (
        <Modal onClose={() => setShowMarketplace(false)} width={900}>
          <div className="-m-5 h-170 relative">
            <span
              onClick={() => setShowMarketplace(false)}
              className="absolute top-4 right-4 z-10 text-[14px] text-t-ink-soft cursor-pointer leading-none"
            >
              ✕
            </span>
            <MarketplaceScreen embedded />
          </div>
        </Modal>
      )}

      {showMcpRegistry && (
        <Modal onClose={() => setShowMcpRegistry(false)} width={900}>
          <div className="-m-5 h-170 relative">
            <span
              onClick={() => setShowMcpRegistry(false)}
              className="absolute top-4 right-4 z-10 text-[14px] text-t-ink-soft cursor-pointer leading-none"
            >
              ✕
            </span>
            <McpRegistryScreen />
          </div>
        </Modal>
      )}

      {showSkillCreator && (
        <SkillCreatorModal
          workspacePath={workspacePath}
          onClose={() => setShowSkillCreator(false)}
        />
      )}
    </Box>
  )
}
