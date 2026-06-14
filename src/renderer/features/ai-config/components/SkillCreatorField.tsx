import React from 'react'
import { Label } from '../../../components/ui'

export function SkillCreatorField({
  label,
  children,
  hint,
}: {
  label: string
  children: React.ReactNode
  hint?: string
}) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <Label>{label}</Label>
      {children}
      {hint && <div className="text-[11px] text-t-ink-soft leading-snug">{hint}</div>}
    </div>
  )
}
