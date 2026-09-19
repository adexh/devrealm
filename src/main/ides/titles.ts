/**
 * Window title parsing. Pure, so the smoke test can load it under plain Node.
 *
 * VS Code's default title is
 * `${dirty}${activeEditorShort} — ${rootName} — ${profileName} — ${appName}`
 * with empty parts and their separators dropped, so the number of segments
 * varies from one to four. VS Code also truncates long segments itself.
 */

const TITLE_SEPARATORS = [' — ', ' - ']
const DIRTY_MARKER = '●'

export type ParsedTitle = {
  dirty: boolean
  /** Everything but the app name, left to right. */
  segments: string[]
  appName: string | null
}

export function parseWindowTitle(title: string, appNames: string[]): ParsedTitle {
  let text = title.trim()
  let dirty = false
  if (text.startsWith(DIRTY_MARKER)) {
    dirty = true
    text = text.slice(DIRTY_MARKER.length).trim()
  }

  const separator = TITLE_SEPARATORS.find(candidate => text.includes(candidate))
  const segments = separator
    ? text.split(separator).map(segment => segment.trim()).filter(Boolean)
    : (text ? [text] : [])

  let appName: string | null = null
  const last = segments[segments.length - 1]
  if (last && appNames.includes(last)) {
    appName = last
    segments.pop()
  }

  return { dirty, segments, appName }
}

/**
 * Folder-name candidates, most likely first. The root name sits to the right of
 * the editor name, so segments are tried right to left; a profile name to its
 * right simply fails to match anything and falls through.
 */
export function folderCandidates(parsed: ParsedTitle): string[] {
  return [...parsed.segments].reverse()
}
