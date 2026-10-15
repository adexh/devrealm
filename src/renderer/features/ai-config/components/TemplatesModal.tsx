import { useState } from 'react'
import { Upload } from 'lucide-react'
import { Btn, Chip, Modal, Mono } from '../../../components/ui'
import { TEMPLATE_KIND_LABELS } from '../constants/templates'
import { useTemplates } from '../hooks/useTemplates'
import { importTemplate } from '../ipc/templates'
import { TemplateInstallPane } from './TemplateInstallPane'

export function TemplatesModal({ targetPath, targetLabel, onClose, onInstalled }: {
  targetPath: string
  targetLabel: string
  onClose: () => void
  onInstalled: () => void
}) {
  const { templates, loading, error, refresh } = useTemplates()
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const normalized = query.trim().toLowerCase()
  const visible = templates.filter(template =>
    !normalized || `${template.name} ${template.description ?? ''}`.toLowerCase().includes(normalized))
  const selected = visible.find(template => template.id === selectedId) ?? visible[0] ?? null

  async function handleImport() {
    setImportError(null)
    try {
      const imported = await importTemplate()
      if (!imported) return
      await refresh()
      setQuery('')
      setSelectedId(imported.id)
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Unable to import the Template.')
    }
  }

  return (
    <Modal title="AI configuration Templates" width={1120} onClose={onClose}>
      <div className="flex gap-4 h-[72vh]">
        <aside className="w-72 flex-none flex flex-col min-h-0 border-r border-t-line pr-4">
          <div className="flex gap-2 mb-2">
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search Templates…"
              className="flex-1 min-w-0 h-8 border border-t-line rounded px-2.5 text-[12px] bg-t-bg text-t-ink outline-none focus:border-t-ink-soft"
            />
            <Btn onClick={handleImport}>
              <Upload size={13} aria-hidden="true" />
              Import
            </Btn>
          </div>
          {(importError || error) && (
            <div className="mb-2 text-[11px] text-[#e05252] px-2 py-1.5 border border-[#e05252] rounded-[3px]">{importError ?? error}</div>
          )}
          <div className="flex-1 overflow-y-auto -mx-1">
            {visible.map(template => (
              <button
                key={template.id}
                type="button"
                onClick={() => setSelectedId(template.id)}
                className={template.id === selected?.id
                  ? 'w-full text-left px-2.5 py-2 rounded bg-t-panel-alt cursor-pointer'
                  : 'w-full text-left px-2.5 py-2 rounded hover:bg-t-panel cursor-pointer'}
              >
                <div className="flex items-center gap-2">
                  <span className="flex-1 truncate text-[13px] font-semibold text-t-ink">{template.name}</span>
                  <Chip>{TEMPLATE_KIND_LABELS[template.kind]}</Chip>
                </div>
                {template.description && <div className="mt-0.5 truncate text-[12px] text-t-ink-soft">{template.description}</div>}
                <Mono size={10} soft className="block mt-0.5">{template.items.length} items</Mono>
              </button>
            ))}
            {!loading && visible.length === 0 && (
              <div className="px-2.5 py-4 text-[12px] text-t-ink-soft leading-[1.5]">
                {templates.length === 0
                  ? 'No Templates yet. Use Save as Template to create one, or import a Template file.'
                  : `No Templates match "${query.trim()}".`}
              </div>
            )}
          </div>
        </aside>

        {selected ? (
          <TemplateInstallPane
            key={selected.id}
            template={selected}
            targetPath={targetPath}
            targetLabel={targetLabel}
            onInstalled={onInstalled}
            onDeleted={() => { setSelectedId(null); void refresh() }}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-[13px] text-t-ink-soft">
            {loading ? 'Loading Templates…' : 'Pick a Template to see what it installs.'}
          </div>
        )}
      </div>
    </Modal>
  )
}
