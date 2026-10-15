import React, { useState } from 'react'
import { Box, Btn, Chip, Heading, Label, Mono, AIIcon, InfoPopover, Modal } from '../../../components/ui'
import { MarketplaceScreen } from '../../marketplace'
import { McpRegistryScreen } from './McpRegistryScreen'
import { SkillCreatorModal } from './SkillCreatorModal'
import { RemoveButton } from './RemoveButton'
import { ScrollTable } from './ScrollTable'
import { removePlugin, setPluginEnabled } from '../ipc/plugins'
import { MCP_SCOPE_LABELS } from '../constants/mcp'
import type { McpServer } from '../../../../shared/types'


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
        <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] gap-4 items-start">

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
              <ScrollTable
                count={plugins.length}
                columns={['w-[38%]', '', 'w-12', 'w-8']}
                head={(
                  <tr>
                    <th className="text-left px-2.5 py-2 font-medium text-t-ink-soft whitespace-nowrap">Plugin</th>
                    <th className="text-left px-2.5 py-2 font-medium text-t-ink-soft whitespace-nowrap">Description</th>
                    <th className="px-1 py-2 font-medium text-t-ink-soft text-center whitespace-nowrap">On</th>
                    <th className="py-2"><span className="sr-only">Remove</span></th>
                  </tr>
                )}
              >
                {plugins.map((plugin, i) => {
                  const isBusy = busy === plugin.id
                  const isOn = plugin.enabled
                  return (
                    <tr
                      key={plugin.id}
                      className={`border-b border-t-line last:border-b-0 ${i % 2 === 0 ? 'bg-t-bg' : ''}`}
                      style={{ opacity: isBusy ? 0.5 : 1 }}
                    >
                      <td className="px-2.5 py-2">
                        <div className="font-medium text-t-ink truncate" title={plugin.name}>{plugin.name}</div>
                        <Chip className="mt-0.5">{plugin.version}</Chip>
                      </td>
                      <td className="px-2.5 py-2 text-t-ink-soft">
                        <span className="block truncate" title={plugin.description}>{plugin.description || '—'}</span>
                      </td>
                      <td className="px-1 py-2 text-center">
                        <Toggle on={isOn} onChange={() => handleTogglePlugin(plugin.id, isOn)} />
                      </td>
                      <td className="py-2 pr-1.5 text-center">
                        <RemoveButton onClick={() => handleRemovePlugin(plugin.id)} />
                      </td>
                    </tr>
                  )
                })}
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
              <ScrollTable
                count={allSkills.length}
                columns={['w-[38%]', '', 'w-12', 'w-8']}
                head={(
                  <tr>
                    <th className="text-left px-2.5 py-2 font-medium text-t-ink-soft whitespace-nowrap">Skill</th>
                    <th className="text-left px-2.5 py-2 font-medium text-t-ink-soft whitespace-nowrap">Description</th>
                    <th className="px-1 py-2 font-medium text-t-ink-soft text-center whitespace-nowrap">On</th>
                    <th className="py-2"><span className="sr-only">Remove</span></th>
                  </tr>
                )}
              >
                {allSkills.map((skill, i) => {
                  const key = `${skill.pluginId}:${skill.name}`
                  const isOn = !disabledSkills.has(key)
                  return (
                    <tr
                      key={key}
                      className={`border-b border-t-line last:border-b-0 ${i % 2 === 0 ? 'bg-t-bg' : ''}`}
                    >
                      <td className="px-2.5 py-2">
                        <div className="font-medium text-t-ink truncate" title={`/${skill.name}`}>/{skill.name}</div>
                        <Mono size={10} soft className="block truncate">{skill.pluginName}</Mono>
                      </td>
                      <td className="px-2.5 py-2 text-t-ink-soft">
                        <span className="block truncate" title={skill.description}>{skill.description || '—'}</span>
                      </td>
                      <td className="px-1 py-2 text-center">
                        <Toggle on={isOn} onChange={v => handleToggleSkill(key, v)} />
                      </td>
                      <td className="py-2 pr-1.5 text-center">
                        <RemoveButton onClick={() => handleRemoveSkill(key)} />
                      </td>
                    </tr>
                  )
                })}
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
              <ScrollTable
                count={mcpServers.length}
                columns={['w-[32%]', 'w-16', 'w-18', '']}
                head={(
                  <tr>
                    <th className="text-left px-2.5 py-2 font-medium text-t-ink-soft whitespace-nowrap">Name</th>
                    <th className="text-left px-2.5 py-2 font-medium text-t-ink-soft whitespace-nowrap">Type</th>
                    <th className="text-left px-2.5 py-2 font-medium text-t-ink-soft whitespace-nowrap">Scope</th>
                    <th className="text-left px-2.5 py-2 font-medium text-t-ink-soft whitespace-nowrap">Command / URL</th>
                  </tr>
                )}
              >
                {mcpServers.map((server, i) => (
                  <tr
                    key={`${server.scope}:${server.name}`}
                    className={`border-b border-t-line last:border-b-0 ${i % 2 === 0 ? 'bg-t-bg' : ''}`}
                  >
                    <td className="px-2.5 py-2">
                      <span className="block font-medium text-t-ink truncate" title={server.name}>{server.name}</span>
                    </td>
                    <td className="px-2.5 py-2">
                      <Chip>{server.type}</Chip>
                    </td>
                    <td className="px-2.5 py-2">
                      <span className="text-[11px] text-t-ink-soft" title={MCP_SCOPE_LABELS[server.scope].hint}>{MCP_SCOPE_LABELS[server.scope].label}</span>
                    </td>
                    <td className="px-2.5 py-2">
                      <span className="block truncate font-mono text-[11px] text-t-ink" title={server.command}>{server.command}</span>
                    </td>
                  </tr>
                ))}
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
