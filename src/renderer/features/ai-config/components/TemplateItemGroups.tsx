import type { TemplateItem, TemplateItemGroup } from '../../../../shared/templates'
import { Chip, Label, Mono } from '../../../components/ui'
import { TEMPLATE_GROUP_EMPTY, TEMPLATE_GROUP_LABELS, TEMPLATE_GROUP_ORDER } from '../constants/templates'

export function TemplateItemGroups({ items, selected, onToggle, showEmpty = false }: {
  items: TemplateItem[]
  selected?: Set<string>
  onToggle?: (id: string) => void
  showEmpty?: boolean
}) {
  const groups: [TemplateItemGroup, TemplateItem[]][] = TEMPLATE_GROUP_ORDER
    .map(group => [group, items.filter(item => item.group === group)] as [TemplateItemGroup, TemplateItem[]])
    .filter(([group, groupItems]) => groupItems.length > 0 || (showEmpty && group !== 'other'))

  return (
    <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
      {groups.map(([group, groupItems]) => (
        <div key={group} className="border border-t-line rounded p-3 bg-t-panel min-w-0">
          <div className="flex items-center mb-1.5">
            <Label className="flex-1">{TEMPLATE_GROUP_LABELS[group]}</Label>
            <Mono size={10} soft>{groupItems.length}</Mono>
          </div>
          {groupItems.length === 0 && (
            <div className="py-1 text-[12px] text-t-ink-softer">{TEMPLATE_GROUP_EMPTY[group]}</div>
          )}
          {groupItems.map(item => {
            const body = (
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-1.5">
                  <span className="truncate font-mono text-[12px] text-t-ink">{item.label}</span>
                  {item.personal && <Chip>Personal</Chip>}
                </span>
                {item.detail && <span className="block truncate text-[11px] text-t-ink-soft">{item.detail}</span>}
              </span>
            )
            return selected && onToggle ? (
              <label key={item.id} className="flex items-start gap-2 py-1 cursor-pointer" title={item.detail ?? item.label}>
                <input
                  type="checkbox"
                  checked={selected.has(item.id)}
                  onChange={() => onToggle(item.id)}
                  className="mt-0.75 accent-t-ink"
                />
                {body}
              </label>
            ) : (
              <div key={item.id} className="flex py-1" title={item.detail ?? item.label}>{body}</div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
