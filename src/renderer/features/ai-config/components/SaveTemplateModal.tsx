import { useEffect, useState } from 'react'
import type { TemplateItem, TemplateKind, TemplateSummary } from '../../../../shared/templates'
import { Btn, Chip, Label, Modal, Mono } from '../../../components/ui'
import { TEMPLATE_KIND_LABELS } from '../constants/templates'
import { captureTemplateItems, saveTemplate } from '../ipc/templates'
import { TemplateItemGroups } from './TemplateItemGroups'

export function SaveTemplateModal({ sourcePath, sourceLabel, kind, onClose }: {
  sourcePath: string
  sourceLabel: string
  kind: TemplateKind
  onClose: () => void
}) {
  const [saved, setSaved] = useState<TemplateSummary | null>(null)
  const [items, setItems] = useState<TemplateItem[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    captureTemplateItems(sourcePath)
      .then(captured => {
        if (cancelled) return
        setItems(captured)
        setSelected(new Set(captured.filter(item => !item.personal).map(item => item.id)))
      })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Unable to read the AI configuration.') })
    return () => { cancelled = true }
  }, [sourcePath])

  const canSave = Boolean(name.trim()) && selected.size > 0 && !saving

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      setSaved(await saveTemplate({
        sourcePath,
        kind,
        name: name.trim(),
        description: description.trim() || undefined,
        source: sourceLabel,
        itemIds: [...selected],
      }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save the Template.')
      setSaving(false)
    }
  }

  if (saved) {
    return (
      <Modal title="Template created" width={460} onClose={onClose}>
        <div className="flex flex-col gap-3">
          <div className="text-[13px] text-t-ink-soft leading-relaxed">
            <span className="font-semibold text-t-ink">{saved.name}</span> was saved with {saved.items.length} items.
            Use Scaffold from Template on any project to install it there.
          </div>
          <div className="flex justify-end">
            <Btn primary onClick={onClose}>Done</Btn>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title="Save AI configuration as Template" width={980} onClose={onClose}>
      <div className="flex flex-col gap-4 max-h-[78vh]">
        <div className="grid gap-3 grid-cols-[1fr_1.4fr]">
          <div>
            <Label>Template name</Label>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void handleSave()}
              placeholder="e.g. Next.js backend"
              className="mt-1 h-8 w-full border border-t-line rounded px-2.5 text-[13px] bg-t-bg text-t-ink outline-none focus:border-t-ink-soft"
            />
          </div>
          <div>
            <Label>Description</Label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What this setup is for"
              className="mt-1 h-8 w-full border border-t-line rounded px-2.5 text-[13px] bg-t-bg text-t-ink outline-none focus:border-t-ink-soft"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Chip>{TEMPLATE_KIND_LABELS[kind]} Template</Chip>
          <Mono size={11} soft className="truncate">from {sourceLabel}</Mono>
          <div className="flex-1" />
          {items && items.length > 0 && (
            <>
              <Mono size={11} soft>{selected.size} of {items.length} selected</Mono>
              <button type="button" className="text-[12px] text-t-ink-soft hover:text-t-ink cursor-pointer" onClick={() => setSelected(new Set(items.map(item => item.id)))}>Select all</button>
              <button type="button" className="text-[12px] text-t-ink-soft hover:text-t-ink cursor-pointer" onClick={() => setSelected(new Set())}>None</button>
            </>
          )}
        </div>

        <div className="overflow-y-auto min-h-40">
          {!items && !error && <Mono size={11} soft>Reading AI configuration…</Mono>}
          {items && <TemplateItemGroups items={items} selected={selected} onToggle={toggle} showEmpty />}
          {items?.some(item => item.personal) && (
            <div className="mt-3 text-[12px] text-t-ink-softer">
              Personal items are unticked by default: they can hold tokens and go wherever the template is exported.
            </div>
          )}
        </div>

        {error && (
          <div className="text-[11px] text-[#e05252] px-3 py-2 border border-[#e05252] rounded-[3px]">{error}</div>
        )}

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-t-line">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn primary onClick={handleSave} className={canSave ? '' : 'opacity-45 cursor-not-allowed'}>
            {saving ? 'Creating…' : 'Create Template'}
          </Btn>
        </div>
      </div>
    </Modal>
  )
}
