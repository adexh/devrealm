import type { PluginStatus, ScaffoldAction, ScaffoldMode, TemplateItemGroup, TemplateKind } from '../../../../shared/templates'

export const TEMPLATE_GROUP_LABELS: Record<TemplateItemGroup, string> = {
  instructions: 'Instructions',
  plugins: 'Plugins',
  skills: 'Skills',
  mcp: 'MCP servers',
  agents: 'Agents',
  commands: 'Commands',
  settings: 'Claude Code settings',
  other: 'Hooks & other files',
}

export const TEMPLATE_GROUP_ORDER: TemplateItemGroup[] = ['instructions', 'plugins', 'skills', 'mcp', 'agents', 'commands', 'settings', 'other']

export const TEMPLATE_GROUP_EMPTY: Record<TemplateItemGroup, string> = {
  instructions: 'No CLAUDE.md or AGENTS.md here.',
  plugins: 'No plugins enabled here.',
  skills: 'No skills in .claude/skills.',
  mcp: 'No MCP servers configured.',
  agents: 'No agents in .claude/agents.',
  commands: 'No commands in .claude/commands.',
  settings: 'No Claude Code settings beyond plugins and MCP.',
  other: '',
}

export const TEMPLATE_KIND_LABELS: Record<TemplateKind, string> = {
  project: 'Project',
  workspace: 'Workspace',
  user: 'Global',
}

export const SCAFFOLD_MODES: { id: ScaffoldMode; label: string; hint: string }[] = [
  { id: 'merge', label: 'Keep existing', hint: 'Adds what is missing and merges settings. Files that already exist keep their content.' },
  { id: 'override', label: 'Override existing', hint: 'Replaces every file the Template carries with the Template copy.' },
]

export const SCAFFOLD_ACTION_LABELS: Record<ScaffoldAction, string> = {
  create: 'New',
  merge: 'Merge',
  overwrite: 'Overwrite',
  skip: 'Keep',
  unchanged: 'Same',
}

export const SCAFFOLD_ACTION_CLASSES: Record<ScaffoldAction, string> = {
  create: 'inline-flex justify-center w-18 shrink-0 px-1.5 py-px border rounded-[3px] font-mono text-[10px] uppercase tracking-[0.3px] text-[#148a37] border-[#148a37]',
  merge: 'inline-flex justify-center w-18 shrink-0 px-1.5 py-px border rounded-[3px] font-mono text-[10px] uppercase tracking-[0.3px] text-t-ink border-t-ink-soft',
  overwrite: 'inline-flex justify-center w-18 shrink-0 px-1.5 py-px border rounded-[3px] font-mono text-[10px] uppercase tracking-[0.3px] text-[#d33f49] border-[#d33f49]',
  skip: 'inline-flex justify-center w-18 shrink-0 px-1.5 py-px border rounded-[3px] font-mono text-[10px] uppercase tracking-[0.3px] text-t-ink-soft border-t-line',
  unchanged: 'inline-flex justify-center w-18 shrink-0 px-1.5 py-px border rounded-[3px] font-mono text-[10px] uppercase tracking-[0.3px] text-t-ink-softer border-t-line',
}

export const PLUGIN_STATUS_LABELS: Record<PluginStatus, string> = {
  pending: 'Install',
  present: 'Installed',
  installed: 'Installed now',
  failed: 'Failed',
}

export const PLUGIN_STATUS_CLASSES: Record<PluginStatus, string> = {
  pending: 'inline-flex justify-center w-24 shrink-0 px-1.5 py-px border rounded-[3px] font-mono text-[10px] uppercase tracking-[0.3px] text-[#148a37] border-[#148a37]',
  present: 'inline-flex justify-center w-24 shrink-0 px-1.5 py-px border rounded-[3px] font-mono text-[10px] uppercase tracking-[0.3px] text-t-ink-softer border-t-line',
  installed: 'inline-flex justify-center w-24 shrink-0 px-1.5 py-px border rounded-[3px] font-mono text-[10px] uppercase tracking-[0.3px] text-[#148a37] border-[#148a37]',
  failed: 'inline-flex justify-center w-24 shrink-0 px-1.5 py-px border rounded-[3px] font-mono text-[10px] uppercase tracking-[0.3px] text-[#d33f49] border-[#d33f49]',
}
