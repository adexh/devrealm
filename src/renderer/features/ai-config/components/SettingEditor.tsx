import React from 'react'
import type { ClaudeSettingDefinition } from '../catalog/claudeSettingsCatalog'

export function SettingEditor({
  definition,
  value,
  onChange,
}: {
  definition: ClaudeSettingDefinition
  value: string
  onChange: (value: string) => void
}) {
  if (definition.type === 'boolean' || definition.type === 'select') {
    const options = definition.type === 'boolean' ? ['true', 'false'] : (definition.options ?? [])
    return (
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-8 border border-t-line rounded px-2 text-xs bg-t-bg text-t-ink outline-none"
      >
        {options.map(option => <option key={option} value={option}>{option}</option>)}
      </select>
    )
  }

  if (definition.type === 'json') {
    return (
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={8}
        className="border border-t-line rounded px-2.5 py-2 text-[12px] bg-t-bg text-t-ink font-mono outline-none resize-y w-full box-border"
      />
    )
  }

  return (
    <input
      type={definition.type === 'number' ? 'number' : 'text'}
      value={value}
      onChange={e => onChange(e.target.value)}
      className="h-8 border border-t-line rounded px-2.5 text-[12px] bg-t-bg text-t-ink font-mono outline-none w-full box-border"
    />
  )
}
