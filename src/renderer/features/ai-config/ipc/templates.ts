import type { SaveTemplateRequest, ScaffoldPlan, ScaffoldRequest, ScaffoldResult, TemplateItem, TemplateSummary } from '../../../../shared/templates'

export function listTemplates(): Promise<TemplateSummary[]> {
  return window.electronAPI.templates.list()
}

export function captureTemplateItems(sourcePath: string): Promise<TemplateItem[]> {
  return window.electronAPI.templates.capture(sourcePath)
}

export function saveTemplate(request: SaveTemplateRequest): Promise<TemplateSummary> {
  return window.electronAPI.templates.save(request)
}

export function deleteTemplate(id: string): Promise<void> {
  return window.electronAPI.templates.delete(id)
}

export function planScaffold(request: ScaffoldRequest): Promise<ScaffoldPlan> {
  return window.electronAPI.templates.plan(request)
}

export function applyScaffold(request: ScaffoldRequest): Promise<ScaffoldResult> {
  return window.electronAPI.templates.apply(request)
}

export function exportTemplate(id: string): Promise<string | null> {
  return window.electronAPI.templates.export(id)
}

export function importTemplate(): Promise<TemplateSummary | null> {
  return window.electronAPI.templates.import()
}
