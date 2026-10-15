export type PaneZone = 'center' | 'left' | 'right' | 'top' | 'bottom'
// No tabs means a fresh split waiting on the chooser.
export type PaneGroup = { kind: 'group'; id: string; sessionIds: string[]; activeId: string | null }
export type PaneSplit = {
  kind: 'split'
  id: string
  direction: 'row' | 'column'
  /** Share of the split given to `first`. */
  ratio: number
  first: PaneNode
  second: PaneNode
}
export type PaneNode = PaneGroup | PaneSplit

export type PaneRect = { x: number; y: number; w: number; h: number }
export type PlacedPane = { group: PaneGroup; rect: PaneRect }
export type PlacedSash = { split: PaneSplit; rect: PaneRect }

export function paneGroup(sessionIds: string[], activeId: string | null = sessionIds[0] ?? null): PaneGroup {
  return { kind: 'group', id: globalThis.crypto.randomUUID(), sessionIds, activeId }
}

export function paneGroups(node: PaneNode | null): PaneGroup[] {
  if (!node) return []
  return node.kind === 'group' ? [node] : [...paneGroups(node.first), ...paneGroups(node.second)]
}

export function allSessionIds(node: PaneNode | null): string[] {
  return paneGroups(node).flatMap(group => group.sessionIds)
}

export function groupOf(node: PaneNode | null, sessionId: string | null): PaneGroup | undefined {
  return paneGroups(node).find(group => sessionId !== null && group.sessionIds.includes(sessionId))
}

function mapGroups(node: PaneNode, fn: (group: PaneGroup) => PaneNode | null): PaneNode | null {
  if (node.kind === 'group') return fn(node)
  const first = mapGroups(node.first, fn)
  const second = mapGroups(node.second, fn)
  if (!first) return second
  if (!second) return first
  return first === node.first && second === node.second ? node : { ...node, first, second }
}

export function activateSession(node: PaneNode, sessionId: string): PaneNode {
  return mapGroups(node, group => group.sessionIds.includes(sessionId) && group.activeId !== sessionId ? { ...group, activeId: sessionId } : group) ?? node
}

/** VS Code closes a group once its last tab leaves, unless it is the only one. */
export function removeSession(node: PaneNode, sessionId: string): PaneNode | null {
  const several = paneGroups(node).length > 1
  return mapGroups(node, group => {
    const index = group.sessionIds.indexOf(sessionId)
    if (index === -1) return group
    const sessionIds = group.sessionIds.filter(id => id !== sessionId)
    if (sessionIds.length === 0 && several) return null
    const activeId = group.activeId === sessionId ? (sessionIds[index] ?? sessionIds[index - 1] ?? null) : group.activeId
    return { ...group, sessionIds, activeId }
  })
}

export function insertSession(node: PaneNode, groupId: string, sessionId: string, index = -1): PaneNode {
  return mapGroups(node, group => {
    if (group.id !== groupId) return group
    const sessionIds = [...group.sessionIds]
    sessionIds.splice(index === -1 ? sessionIds.length : index, 0, sessionId)
    return { ...group, sessionIds, activeId: sessionId }
  }) ?? node
}

export function splitGroup(node: PaneNode, groupId: string, sessionId: string | null, zone: Exclude<PaneZone, 'center'>): PaneNode {
  return mapGroups(node, group => {
    if (group.id !== groupId) return group
    const added = paneGroup(sessionId ? [sessionId] : [])
    const before = zone === 'left' || zone === 'top'
    return {
      kind: 'split',
      id: globalThis.crypto.randomUUID(),
      direction: zone === 'left' || zone === 'right' ? 'row' : 'column',
      ratio: 0.5,
      first: before ? added : group,
      second: before ? group : added,
    }
  }) ?? node
}

export function dropOnGroup(node: PaneNode, sessionId: string, groupId: string, zone: PaneZone): PaneNode {
  const target = paneGroups(node).find(group => group.id === groupId)
  const source = groupOf(node, sessionId)
  if (!target) return node
  // Nothing would be left behind to split from, so VS Code ignores this drop too.
  if (source?.id === target.id && (zone === 'center' || target.sessionIds.length === 1)) return node
  const rest = source ? removeSession(node, sessionId) : node
  if (!rest) return node
  return zone === 'center' ? insertSession(rest, groupId, sessionId) : splitGroup(rest, groupId, sessionId, zone)
}

export function dropOnTab(node: PaneNode, sessionId: string, groupId: string, targetId: string | null, after: boolean): PaneNode {
  const source = groupOf(node, sessionId)
  if (sessionId === targetId || (source?.id === groupId && source.sessionIds.length === 1)) return node
  const rest = source ? removeSession(node, sessionId) : node
  const target = paneGroups(rest).find(group => group.id === groupId)
  if (!rest || !target) return node
  const index = targetId ? target.sessionIds.indexOf(targetId) : -1
  return insertSession(rest, groupId, sessionId, index === -1 ? -1 : index + (after ? 1 : 0))
}

/** Closing a split never kills a shell: the group's tabs join the first group left. */
export function closeGroup(node: PaneNode, groupId: string): PaneNode {
  const closing = paneGroups(node).find(group => group.id === groupId)
  const rest = closing ? mapGroups(node, group => group.id === groupId ? null : group) : null
  if (!closing || !rest) return node
  const keeper = paneGroups(rest)[0]
  return mapGroups(rest, group => group.id === keeper.id
    ? { ...group, sessionIds: [...group.sessionIds, ...closing.sessionIds] }
    : group) ?? rest
}

export function mergeGroups(node: PaneNode, activeId: string | null): PaneGroup {
  const ids = allSessionIds(node)
  return paneGroup(ids, activeId && ids.includes(activeId) ? activeId : ids[0] ?? null)
}

/** An empty split waiting on its own is no layout. */
export function reconcileLayout(node: PaneNode | null, liveIds: string[], preferredId: string | null): PaneNode | null {
  const live = new Set(liveIds)
  let next = node
  for (const id of allSessionIds(node)) {
    if (!live.has(id) && next) next = removeSession(next, id)
  }
  if (liveIds.length === 0) return null
  const known = new Set(allSessionIds(next))
  if (!next || known.size === 0) return paneGroup(liveIds)
  const missing = liveIds.filter(id => !known.has(id))
  if (missing.length === 0) return next
  const target = groupOf(next, preferredId) ?? paneGroups(next).find(group => group.sessionIds.length > 0)
  return mapGroups(next, group => group === target
    ? { ...group, sessionIds: [...group.sessionIds, ...missing] }
    : group) ?? next
}

export function resizeSplit(node: PaneNode, splitId: string, ratio: number): PaneNode {
  if (node.kind === 'group') return node
  if (node.id === splitId) return { ...node, ratio }
  return { ...node, first: resizeSplit(node.first, splitId, ratio), second: resizeSplit(node.second, splitId, ratio) }
}

/** Panes render as flat siblings: nesting them like the tree would remount and re-attach a terminal whenever its pane moved a level. */
export function placePanes(node: PaneNode, rect: PaneRect = { x: 0, y: 0, w: 1, h: 1 }): { panes: PlacedPane[]; sashes: PlacedSash[] } {
  if (node.kind === 'group') return { panes: [{ group: node, rect }], sashes: [] }
  const row = node.direction === 'row'
  const firstRect = row ? { ...rect, w: rect.w * node.ratio } : { ...rect, h: rect.h * node.ratio }
  const secondRect = row
    ? { ...rect, x: rect.x + firstRect.w, w: rect.w - firstRect.w }
    : { ...rect, y: rect.y + firstRect.h, h: rect.h - firstRect.h }
  const first = placePanes(node.first, firstRect)
  const second = placePanes(node.second, secondRect)
  return {
    panes: [...first.panes, ...second.panes],
    sashes: [{ split: node, rect }, ...first.sashes, ...second.sashes],
  }
}

/** VS Code's editor drop target thresholds, with its default right-hand split preference. */
export function dropZone(x: number, y: number, width: number, height: number): PaneZone {
  const edgeX = width * 0.1
  const edgeY = height * 0.1
  if (x > edgeX && x < width - edgeX && y > edgeY && y < height - edgeY) return 'center'
  if (x < width / 3) return 'left'
  if (x > (width * 2) / 3) return 'right'
  return y < height / 2 ? 'top' : 'bottom'
}

export function orderByIds<T extends { id: string }>(sessions: T[], ids: string[]): T[] {
  const rank = new Map(ids.map((id, index) => [id, index]))
  return [...sessions].sort((a, b) => (rank.get(a.id) ?? ids.length) - (rank.get(b.id) ?? ids.length))
}
