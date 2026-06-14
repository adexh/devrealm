import React, { CSSProperties, useEffect, useRef, useState } from 'react'
import { Switch as SwitchPrimitive } from '@base-ui/react/switch'
import { Info } from 'lucide-react'
import cn from 'classnames'
import { useTheme } from '../theme'

// ─── Box ──────────────────────────────────────────────────────
export function Box({
  children, dashed = false, style = {}, hatch = false, onClick, className = '',
}: {
  children?: React.ReactNode
  dashed?: boolean
  style?: CSSProperties
  hatch?: boolean
  onClick?: () => void
  className?: string
}) {
  const t = useTheme()
  return (
    <div
      onClick={onClick}
      className={`border ${dashed ? 'border-dashed' : ''} border-t-line rounded ${className}`}
      style={hatch ? {
        background: `repeating-linear-gradient(45deg, transparent 0 6px, var(--t-hatch) 6px 7px)`,
        ...style,
      } : style}
    >{children}</div>
  )
}

// ─── Btn ──────────────────────────────────────────────────────
export function Btn({
  children, primary = false, full = false, style = {}, onClick, className = '',
}: {
  children: React.ReactNode
  primary?: boolean
  full?: boolean
  style?: CSSProperties
  onClick?: () => void
  className?: string
}) {
  return (
    <div
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 text-[13px] whitespace-nowrap cursor-pointer select-none px-3 py-1.5 rounded border
        ${primary ? 'border-t-accent-bg bg-t-accent-bg text-t-accent-ink font-semibold' : 'border-t-line bg-transparent text-t-ink font-medium'}
        ${full ? 'w-full' : ''}
        ${className}`}
      style={style}
    >{children}</div>
  )
}

// ─── Switch ───────────────────────────────────────────────────
export function Switch({
  className,
  size = 'default',
  ...props
}: Omit<SwitchPrimitive.Root.Props, 'className'> & {
  className?: string
  size?: 'sm' | 'default'
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        'peer group/switch relative inline-flex shrink-0 items-center rounded-full border border-transparent transition-all outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-t-accent-bg focus-visible:ring-3 focus-visible:ring-t-accent-bg/50 data-[size=default]:h-[18.4px] data-[size=default]:w-[32px] data-[size=sm]:h-[14px] data-[size=sm]:w-[24px] data-checked:bg-t-accent-bg data-unchecked:bg-t-line data-disabled:cursor-not-allowed data-disabled:opacity-50',
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block rounded-full bg-t-bg ring-0 shadow-[0_1px_4px_rgba(0,0,0,0.28)] transition-transform group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 group-data-[size=default]/switch:data-checked:translate-x-[calc(100%-2px)] group-data-[size=sm]/switch:data-checked:translate-x-[calc(100%-2px)] group-data-[size=default]/switch:data-unchecked:translate-x-0 group-data-[size=sm]/switch:data-unchecked:translate-x-0"
      />
    </SwitchPrimitive.Root>
  )
}

// ─── Chip ─────────────────────────────────────────────────────
export function Chip({
  children, accent = false, style = {}, onClick, className = '',
}: {
  children: React.ReactNode
  accent?: boolean
  style?: CSSProperties
  onClick?: () => void
  className?: string
}) {
  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center gap-1 text-[11px] font-medium tracking-[0.3px] uppercase px-1.5 py-0.5 rounded-[3px]
        ${accent ? 'bg-t-accent-bg text-t-accent-ink' : 'bg-t-chip text-t-ink-soft'}
        ${onClick ? 'cursor-pointer' : 'cursor-default'}
        select-none ${className}`}
      style={style}
    >{children}</span>
  )
}

// ─── Kbd ──────────────────────────────────────────────────────
export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block font-mono text-[11px] font-medium px-1.25 py-px border border-t-line border-b-2 rounded-[3px] text-t-ink-soft bg-t-panel leading-[1.4] min-w-3.5 text-center">
      {children}
    </span>
  )
}

// ─── Label ────────────────────────────────────────────────────
export function Label({ children, style = {}, className = '' }: {
  children: React.ReactNode
  style?: CSSProperties
  className?: string
}) {
  return (
    <div className={`text-[11px] font-semibold tracking-[0.6px] uppercase text-t-ink-softer ${className}`} style={style}>
      {children}
    </div>
  )
}

// ─── Heading ──────────────────────────────────────────────────
export function Heading({ children, size = 16, style = {}, className = '' }: {
  children: React.ReactNode
  size?: number
  style?: CSSProperties
  className?: string
}) {
  return (
    <div className={`font-semibold text-t-ink tracking-[-0.2px] ${className}`} style={{ fontSize: size + 1, ...style }}>
      {children}
    </div>
  )
}

// ─── Mono ─────────────────────────────────────────────────────
export function Mono({ children, size = 11, soft = false, style = {}, className = '', onClick }: {
  children: React.ReactNode
  size?: number
  soft?: boolean
  style?: CSSProperties
  className?: string
  onClick?: () => void
}) {
  return (
    <span
      onClick={onClick}
      className={`font-mono ${soft ? 'text-t-ink-soft' : 'text-t-ink'} ${className}`}
      style={{ fontSize: size + 1, ...style }}
    >{children}</span>
  )
}

// ─── Bar ──────────────────────────────────────────────────────
export function Bar({ value = 0.5, height = 6, color, style = {} }: {
  value?: number
  height?: number
  color?: string
  style?: CSSProperties
}) {
  return (
    <div
      className="w-full overflow-hidden"
      style={{ height, borderRadius: height / 2, background: 'var(--t-line-soft)', ...style }}
    >
      <div style={{ width: `${Math.min(value, 1) * 100}%`, height: '100%', background: color || 'var(--t-ink)' }} />
    </div>
  )
}

// ─── StackedBar ───────────────────────────────────────────────
function minWidthPcts(values: number[], minPct: number): number[] {
  const total = values.reduce((a, v) => a + v, 0) || 1
  const nonZero = values.filter(v => v > 0).length
  const minTotal = nonZero * minPct
  const remaining = Math.max(0, 100 - minTotal)
  return values.map(v => v === 0 ? 0 : minPct + (v / total) * remaining)
}

export function StackedBar({ segments, height = 12 }: {
  segments: { value: number; color: string; label?: string }[]
  height?: number
}) {
  const widths = minWidthPcts(segments.map(s => s.value), 4)
  return (
    <div className="w-full flex overflow-hidden rounded-xs" style={{ height, background: 'var(--t-line-soft)' }}>
      {segments.map((s, i) => (
        <div key={i} style={{
          width: `${widths[i]}%`,
          background: s.color,
          borderRight: i < segments.length - 1 ? '1px solid var(--t-bg)' : 'none',
        }} title={s.label} />
      ))}
    </div>
  )
}

// ─── Treemap ──────────────────────────────────────────────────
export function Treemap({ items, height = 160 }: {
  items: { label: string; value: number; size: string }[]
  height?: number
}) {
  const widths = minWidthPcts(items.map(it => it.value), 7)
  return (
    <div className="w-full border border-t-line rounded overflow-hidden flex" style={{ height }}>
      {items.map((it, i) => (
        <div key={i}
          className="flex flex-col justify-between p-2 text-[11px] text-t-ink-soft overflow-hidden"
          style={{
            width: `${widths[i]}%`,
            borderRight: i < items.length - 1 ? '1px solid var(--t-line)' : 'none',
            background: i % 2 === 0 ? 'var(--t-panel)' : 'var(--t-panel-alt)',
          }}
        >
          <div className="font-semibold text-[12px] text-t-ink whitespace-nowrap overflow-hidden text-ellipsis">{it.label}</div>
          <span className="font-mono text-[11px]">{it.size}</span>
        </div>
      ))}
    </div>
  )
}

export type TabItem = string | { id: string; label: string }

// ─── Tabs ─────────────────────────────────────────────────────
export function Tabs({ active, items = ['Dashboard', 'AI Configs'], onChange, centerSlot, rightSlot }: {
  active: string
  items?: TabItem[]
  onChange: (tab: string) => void
  centerSlot?: React.ReactNode
  rightSlot?: React.ReactNode
}) {
  return (
    <div className="relative flex-none h-14 border-b border-t-line bg-t-panel">
      <div className="flex h-full items-end gap-0.5 px-4">
        {items.map(item => {
          const id = typeof item === 'string' ? item : item.id
          const label = typeof item === 'string' ? item : item.label
          const isActive = id === active
          return (
            <div key={id} onClick={() => onChange(id)}
              className={`px-4 py-3.5 text-[13px] cursor-pointer select-none -mb-px border-b-2 max-w-48 truncate
                ${isActive ? 'font-semibold text-t-ink border-t-ink' : 'font-medium text-t-ink-soft border-transparent'}`}
              title={label}
            >{label}</div>
          )
        })}
      </div>
      {centerSlot && (
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center pointer-events-none px-4">
          <div className="pointer-events-auto">
            {centerSlot}
          </div>
        </div>
      )}
      {rightSlot && (
        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-auto">
          {rightSlot}
        </div>
      )}
    </div>
  )
}

// ─── TitleBar ─────────────────────────────────────────────────
export function TitleBar({ title }: { title: string }) {
  return (
    <div
      className="h-9.5 flex-none bg-t-panel-alt border-b border-t-line flex items-center px-3.5 gap-2 relative"
      style={{ WebkitAppRegion: 'drag' } as CSSProperties}
    >
      <div className="flex gap-1.5">
        {['#ff5f57', '#ffbd2e', '#28c840'].map((c, i) => (
          <div key={i} className="w-2.75 h-2.75 rounded-full" style={{ background: c }} />
        ))}
      </div>
      <div className="absolute inset-x-0 text-center text-[13px] text-t-ink-soft font-medium pointer-events-none">
        {title}
      </div>
    </div>
  )
}

// ─── SearchBox ────────────────────────────────────────────────
export function SearchBox({ placeholder = 'Jump to…', width = 220, height = 28, onClick }: {
  placeholder?: string
  width?: number
  height?: number
  onClick?: () => void
}) {
  return (
    <Box
      style={{ width, height }}
      className={`flex items-center px-2.5 gap-1.5${onClick ? ' cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <span className="text-[12px] text-t-ink-softer">⌕</span>
      <span className="text-[12px] text-t-ink-softer flex-1">{placeholder}</span>
      <Kbd>⌘K</Kbd>
    </Box>
  )
}

export type InfoPopoverReference = {
  label: string
  href: string
}

// ─── InfoPopover ──────────────────────────────────────────────
export function InfoPopover({
  title,
  description,
  references = [],
  align = 'start',
}: {
  title: string
  description: React.ReactNode
  references?: InfoPopoverReference[]
  align?: 'start' | 'end'
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <span ref={ref} className="relative inline-flex align-middle">
      <button
        type="button"
        onClick={event => {
          event.stopPropagation()
          setOpen(value => !value)
        }}
        className={`h-5 w-5 inline-flex items-center justify-center rounded text-t-ink-soft hover:text-t-ink hover:bg-t-bg border border-transparent hover:border-t-line cursor-pointer ${open ? 'bg-t-bg border-t-line text-t-ink' : ''}`}
        aria-label={`More information about ${title}`}
        aria-expanded={open}
        title={title}
      >
        <Info size={13} strokeWidth={2} aria-hidden="true" />
      </button>
      {open && (
        <span
          role="dialog"
          className={`absolute top-6 z-200 w-76 max-w-[calc(100vw-2rem)] rounded border border-t-line bg-t-bg shadow-[0_8px_24px_rgba(0,0,0,0.22)] text-left ${align === 'end' ? 'right-0' : 'left-0'}`}
          onClick={event => event.stopPropagation()}
        >
          <span className="block px-3 py-2 text-[12px] font-semibold text-t-ink">
            {title}
          </span>
          <span className="block border-t border-t-line" />
          <span className="block px-3 py-2.5 text-[12px] leading-[1.5] text-t-ink-soft">
            {description}
          </span>
          {references.length > 0 && (
            <span className="block px-3 pb-2.5">
              {references.map(reference => (
                <a
                  key={reference.href}
                  href={reference.href}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-[12px] text-t-accent-bg hover:underline"
                >
                  {reference.label}
                </a>
              ))}
            </span>
          )}
        </span>
      )}
    </span>
  )
}

// ─── FolderIcon ───────────────────────────────────────────────
export function FolderIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className="shrink-0">
      <path d="M1.5 4.5 L1.5 13 Q1.5 13.5 2 13.5 L14 13.5 Q14.5 13.5 14.5 13 L14.5 6 Q14.5 5.5 14 5.5 L8 5.5 L6.5 4 L2 4 Q1.5 4 1.5 4.5 Z"
        fill="none" stroke="var(--t-ink-soft)" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}

// ─── GitIcon ──────────────────────────────────────────────────
export function GitIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className="shrink-0">
      <circle cx="4" cy="3" r="1.5" fill="none" stroke="var(--t-ink-soft)" strokeWidth="1.2" />
      <circle cx="4" cy="13" r="1.5" fill="none" stroke="var(--t-ink-soft)" strokeWidth="1.2" />
      <circle cx="12" cy="8" r="1.5" fill="none" stroke="var(--t-ink-soft)" strokeWidth="1.2" />
      <path d="M4 4.5 L4 11.5 M4 8 Q4 8 12 8" fill="none" stroke="var(--t-ink-soft)" strokeWidth="1.2" />
    </svg>
  )
}

// ─── Modal ────────────────────────────────────────────────────
export function Modal({
  children, onClose, width = 480, title, disableBackdropClose = false,
}: {
  children: React.ReactNode
  onClose: () => void
  width?: number
  title?: string
  disableBackdropClose?: boolean
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      onClick={disableBackdropClose ? undefined : onClose}
      className="fixed inset-0 z-1000 bg-black/45 flex items-center justify-center"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-t-bg border border-t-line rounded-md shadow-[0_8px_32px_rgba(0,0,0,0.28)] flex flex-col overflow-hidden"
        style={{ width }}
      >
        {title && (
          <div className="flex items-center px-4 py-3 border-b border-t-line">
            <Heading size={13}>{title}</Heading>
            <div className="flex-1" />
            <span onClick={onClose} className="text-[14px] text-t-ink-soft cursor-pointer leading-none">✕</span>
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

// ─── AIIcon ───────────────────────────────────────────────────
export function AIIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className="shrink-0">
      <path d="M8 2 L9.5 6.5 L14 8 L9.5 9.5 L8 14 L6.5 9.5 L2 8 L6.5 6.5 Z"
        fill="none" stroke="var(--t-ink-soft)" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}
