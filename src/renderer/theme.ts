import { createContext, useContext } from 'react'

export type Theme = {
  bg: string
  panel: string
  panelAlt: string
  ink: string
  inkSoft: string
  inkSofter: string
  line: string
  lineSoft: string
  accentBg: string
  accentInk: string
  hatch: string
  chip: string
}

export const CSS_VARS: Theme = {
  bg: 'var(--t-bg)',
  panel: 'var(--t-panel)',
  panelAlt: 'var(--t-panel-alt)',
  ink: 'var(--t-ink)',
  inkSoft: 'var(--t-ink-soft)',
  inkSofter: 'var(--t-ink-softer)',
  line: 'var(--t-line)',
  lineSoft: 'var(--t-line-soft)',
  accentBg: 'var(--t-accent-bg)',
  accentInk: 'var(--t-accent-ink)',
  hatch: 'var(--t-hatch)',
  chip: 'var(--t-chip)',
}

export const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace'

export const ThemeContext = createContext<Theme>(CSS_VARS)
export const useTheme = () => useContext(ThemeContext)
