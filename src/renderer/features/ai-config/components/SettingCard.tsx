import React from 'react'
import type { ClaudeSettingDefinition } from '../catalog/claudeSettingsCatalog'
import { Box, Btn, Chip, Heading, InfoPopover, Mono } from '../../../components/ui'
import { SettingEditor } from './SettingEditor'

function formatPreview(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value, null, 2)
}

export function SettingCard({
  definition,
  value,
  isEditing,
  editorValue,
  editorError,
  onEditorChange,
  onStartEdit,
  onCancelEdit,
  onApply,
  onRemove,
}: {
  definition: ClaudeSettingDefinition
  value: unknown
  isEditing: boolean
  editorValue: string
  editorError: string | null
  onEditorChange: (value: string) => void
  onStartEdit: () => void
  onCancelEdit: () => void
  onApply: () => void
  onRemove: () => void
}) {
  const isConfigured = value !== undefined
  const preview = isConfigured ? formatPreview(value) : formatPreview(definition.example ?? '')

  return (
    <Box className="p-3 bg-t-panel flex flex-col gap-2.5">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Heading size={13}>{definition.label}</Heading>
            <InfoPopover
              title={definition.label}
              description={definition.description}
              references={definition.references}
            />
            <Chip>{definition.type}</Chip>
            {definition.availability === 'localOnly' && <Chip accent>local only</Chip>}
            {!isConfigured && <Chip>not set</Chip>}
          </div>
          <Mono size={11} soft className="block mt-0.5">{definition.key}</Mono>
        </div>
        <div className="flex gap-1.5">
          {!isEditing && (
            <Btn primary={!isConfigured} onClick={onStartEdit}>
              {isConfigured ? 'Edit' : 'Configure'}
            </Btn>
          )}
          {isConfigured && !isEditing && <Btn onClick={onRemove}>Remove</Btn>}
        </div>
      </div>

      {!isEditing && (
        <pre className={`m-0 p-2.5 rounded-[3px] border border-t-line-soft text-[11px] whitespace-pre-wrap break-all overflow-auto ${isConfigured ? 'bg-t-bg text-t-ink' : 'bg-transparent text-t-ink-soft border-dashed'}`}>
          {preview}
        </pre>
      )}

      {isEditing && (
        <div className="flex flex-col gap-2">
          <SettingEditor definition={definition} value={editorValue} onChange={onEditorChange} />
          {editorError && (
            <div className="text-[11px] text-[#e05252] px-2 py-1.5 border border-[#e05252] rounded-[3px]">
              {editorError}
            </div>
          )}
          <div className="flex gap-2">
            <Btn primary onClick={onApply}>Apply</Btn>
            <Btn onClick={onCancelEdit}>Cancel</Btn>
            {isConfigured && <Btn onClick={onRemove}>Remove</Btn>}
          </div>
        </div>
      )}
    </Box>
  )
}
