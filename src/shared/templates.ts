export const TEMPLATE_EXPORT_FORMAT = 'devrealm-template'
export const TEMPLATE_EXPORT_VERSION = 1

export type TemplateKind = 'project' | 'workspace' | 'user'

export type ScaffoldMode = 'merge' | 'override'

export type TemplateFile = {
  path: string
  content: string
}

export type TemplatePlugin = {
  id: string
  marketplace?: string
}

export type TemplateContent = {
  files: TemplateFile[]
  plugins: TemplatePlugin[]
}

export type TemplateItemGroup = 'instructions' | 'plugins' | 'skills' | 'mcp' | 'agents' | 'commands' | 'settings' | 'other'

export type TemplateItem = {
  id: string
  group: TemplateItemGroup
  label: string
  detail?: string
  personal?: boolean
}

export type ScaffoldTemplate = TemplateContent & {
  id: string
  kind: TemplateKind
  name: string
  description?: string
  source?: string
  createdAt: number
  updatedAt: number
}

export type TemplateDraft = Omit<ScaffoldTemplate, 'id' | 'createdAt' | 'updatedAt'>

export type TemplateSummary = Omit<ScaffoldTemplate, 'files'> & { items: TemplateItem[] }

export type SaveTemplateRequest = {
  sourcePath: string
  kind: TemplateKind
  name: string
  description?: string
  source?: string
  itemIds: string[]
}

export type ScaffoldAction = 'create' | 'merge' | 'overwrite' | 'skip' | 'unchanged'

export type ScaffoldPlanEntry = {
  path: string
  action: ScaffoldAction
}

export type PluginStatus = 'pending' | 'present' | 'installed' | 'failed'

export type PluginInstallState = {
  id: string
  status: PluginStatus
  message?: string
}

export type ScaffoldPlan = {
  files: ScaffoldPlanEntry[]
  plugins: PluginInstallState[]
}

export type ScaffoldRequest = {
  templateId: string
  targetPath: string
  mode: ScaffoldMode
}

export type ScaffoldResult = {
  written: string[]
  skipped: string[]
  plugins: PluginInstallState[]
}
