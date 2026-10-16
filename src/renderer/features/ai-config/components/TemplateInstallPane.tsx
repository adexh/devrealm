import { useEffect, useMemo, useState } from 'react'
import { Download, Trash2 } from 'lucide-react'
import type { ScaffoldMode, ScaffoldPlan, ScaffoldResult, TemplateSummary } from '../../../../shared/templates'
import { Btn, Chip, Heading, Label, Mono } from '../../../components/ui'
import { relTime } from '../../../utils/format'
import {
  PLUGIN_STATUS_CLASSES,
  PLUGIN_STATUS_LABELS,
  SCAFFOLD_ACTION_CLASSES,
  SCAFFOLD_ACTION_LABELS,
  SCAFFOLD_MODES,
  TEMPLATE_KIND_LABELS,
} from '../constants/templates'
import { applyScaffold, deleteTemplate, exportTemplate, planScaffold } from '../ipc/templates'
import { Segmented } from './Segmented'
import { TemplateItemGroups } from './TemplateItemGroups'

export function TemplateInstallPane({ template, targetPath, targetLabel, onInstalled, onDeleted }: {
  template: TemplateSummary
  targetPath: string
  targetLabel: string
  onInstalled: () => void
  onDeleted: () => void
}) {
  const [mode, setMode] = useState<ScaffoldMode>('merge')
  const [plan, setPlan] = useState<ScaffoldPlan | null>(null)
  const [showChanges, setShowChanges] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [result, setResult] = useState<ScaffoldResult | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setPlan(null)
    planScaffold({ templateId: template.id, targetPath, mode })
      .then(next => { if (!cancelled) setPlan(next) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Unable to check the target.') })
    return () => { cancelled = true }
  }, [template.id, targetPath, mode, result])

  const counts = useMemo(() => {
    const tally = { create: 0, merge: 0, overwrite: 0, skip: 0, unchanged: 0 }
    for (const entry of plan?.files ?? []) tally[entry.action]++
    return tally
  }, [plan])
  const pluginsToInstall = plan?.plugins.filter(plugin => plugin.status === 'pending').length ?? 0
  const writes = counts.create + counts.merge + counts.overwrite
  const canInstall = Boolean(plan) && writes + pluginsToInstall > 0 && !installing

  async function handleInstall() {
    if (!canInstall) return
    setInstalling(true)
    setError(null)
    try {
      setResult(await applyScaffold({ templateId: template.id, targetPath, mode }))
      onInstalled()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Installing the Template failed.')
    } finally {
      setInstalling(false)
    }
  }

  async function handleExport() {
    try {
      await exportTemplate(template.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to export the Template.')
    }
  }

  async function handleDelete() {
    try {
      await deleteTemplate(template.id)
      onDeleted()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to delete the Template.')
    }
  }

  const failedPlugins = result?.plugins.filter(plugin => plugin.status === 'failed') ?? []

  return (
    <div className="flex-1 min-w-0 flex flex-col min-h-0">
      <div className="pb-3 border-b border-t-line flex-none">
        <div className="flex items-center gap-2">
          <Heading size={15} className="truncate">{template.name}</Heading>
          <Chip>{TEMPLATE_KIND_LABELS[template.kind]}</Chip>
          <div className="flex-1" />
          <Btn onClick={handleExport}>
            <Download size={13} aria-hidden="true" />
            Export
          </Btn>
          {confirmDelete ? (
            <>
              <Btn onClick={() => setConfirmDelete(false)}>Keep</Btn>
              <Btn onClick={handleDelete} className="text-[#d33f49] border-[#d33f49]">Delete Template</Btn>
            </>
          ) : (
            <Btn onClick={() => setConfirmDelete(true)}>
              <Trash2 size={13} aria-hidden="true" />
              <span className="sr-only">Delete Template</span>
            </Btn>
          )}
        </div>
        {template.description && <div className="mt-1.5 text-[13px] text-t-ink-soft leading-[1.5]">{template.description}</div>}
        <Mono size={11} soft className="block mt-1.5">
          {template.items.length} items{template.source ? ` · from ${template.source}` : ''} · updated {relTime(template.updatedAt)}
        </Mono>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto py-3">
        <TemplateItemGroups items={template.items} />
      </div>

      <div className="pt-3 border-t border-t-line flex-none flex flex-col gap-2.5">
        <div className="flex items-center gap-3">
          <Label>Install into</Label>
          <Mono size={11} className="truncate flex-1" >{targetLabel}</Mono>
          <Segmented options={SCAFFOLD_MODES} value={mode} onChange={setMode} />
        </div>
        <div className="text-[12px] text-t-ink-soft">{SCAFFOLD_MODES.find(option => option.id === mode)?.hint}</div>

        {plan && (
          <div className="flex items-center gap-2">
            <Mono size={11} soft>
              {counts.create} new · {counts.merge} merged · {counts.overwrite} overwritten · {counts.skip + counts.unchanged} kept
              {plan.plugins.length > 0 && ` · ${pluginsToInstall} of ${plan.plugins.length} plugins to install`}
            </Mono>
            <button type="button" onClick={() => setShowChanges(value => !value)} className="text-[12px] text-t-ink-soft hover:text-t-ink underline cursor-pointer">
              {showChanges ? 'Hide changes' : 'Show changes'}
            </button>
          </div>
        )}

        {plan && showChanges && (
          <div className="max-h-44 overflow-y-auto border border-t-line rounded">
            {plan.files.map(entry => (
              <div key={entry.path} className="flex items-center gap-3 px-3 py-1 border-b border-t-line-soft last:border-b-0">
                <span className={SCAFFOLD_ACTION_CLASSES[entry.action]}>{SCAFFOLD_ACTION_LABELS[entry.action]}</span>
                <Mono size={11} className="truncate">{entry.path}</Mono>
              </div>
            ))}
            {plan.plugins.map(plugin => (
              <div key={plugin.id} className="flex items-center gap-3 px-3 py-1 border-b border-t-line-soft last:border-b-0">
                <span className={PLUGIN_STATUS_CLASSES[plugin.status]}>{PLUGIN_STATUS_LABELS[plugin.status]}</span>
                <Mono size={11} className="truncate">{plugin.id}</Mono>
              </div>
            ))}
          </div>
        )}

        {result && (
          <div className={failedPlugins.length
            ? 'px-3 py-2 border border-[#d33f49] rounded-[3px] text-[12px] text-t-ink'
            : 'px-3 py-2 border border-[#148a37] rounded-[3px] text-[12px] text-t-ink'}>
            Installed: {result.written.length} files written
            {result.skipped.length > 0 && `, ${result.skipped.length} existing kept`}
            {result.plugins.length > 0 && `, ${result.plugins.filter(plugin => plugin.status === 'installed').length} plugins installed`}.
            {failedPlugins.map(plugin => (
              <div key={plugin.id} className="mt-1 text-[11px] text-[#d33f49]">{plugin.id}: {plugin.message}</div>
            ))}
          </div>
        )}

        {error && (
          <div className="text-[11px] text-[#e05252] px-3 py-2 border border-[#e05252] rounded-[3px]">{error}</div>
        )}

        <div className="flex items-center justify-end gap-2">
          {mode === 'override' && counts.overwrite > 0 && (
            <Mono size={11} style={{ color: '#d33f49' }}>{counts.overwrite} existing files will be replaced</Mono>
          )}
          <Btn primary onClick={handleInstall} className={canInstall ? '' : 'opacity-45 cursor-not-allowed'}>
            {installing ? (pluginsToInstall ? 'Installing plugins…' : 'Installing…') : 'Install this Template'}
          </Btn>
        </div>
      </div>
    </div>
  )
}
