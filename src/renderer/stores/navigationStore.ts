import { create } from 'zustand'
import type { MarkdownFileIdentity } from '../../shared/types'

export type StaticTab = 'Dashboard' | 'AI Configs'
export type MarkdownEditorTab = `Editor:${string}`
export type Tab = StaticTab | MarkdownEditorTab

type MarkdownEditorSessionFields = {
  id: string
  name: string
  pathLabel?: string
  content: string
  savedContent: string
  loading: boolean
  saving: boolean
  error: string | null
  isDraft?: boolean
}

export type MarkdownEditorSession = MarkdownFileIdentity & MarkdownEditorSessionFields
export type MarkdownEditorOpenSession = MarkdownFileIdentity & Omit<MarkdownEditorSessionFields, 'id'> & { id?: string }

type NavSnapshot = {
  tab: Tab
  selectedWorkspaceId: string | null
  aiConfigWorkspaceId: string | null
}

interface NavigationState {
  activeTab: Tab
  selectedWorkspaceId: string | null
  aiConfigWorkspaceId: string | null
  markdownEditors: MarkdownEditorSession[]
  markdownCloseRequestedId: string | null
  navHistory: NavSnapshot[]
  setSelectedWorkspaceId: (id: string | null) => void
  setAiConfigWorkspaceId: (id: string | null) => void
  handleTabChange: (tab: Tab) => void
  navigateToAIConfig: (workspaceId: string) => void
  openMarkdownEditor: (session: MarkdownEditorOpenSession) => void
  updateMarkdownEditor: (id: string, patch: Partial<Omit<MarkdownEditorSessionFields, 'id'>> | ((current: MarkdownEditorSession) => MarkdownEditorSession)) => void
  requestCloseMarkdownEditor: (id: string) => void
  cancelCloseMarkdownEditor: () => void
  closeMarkdownEditor: (id: string) => void
  goBack: () => void
}

function makeEditorId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function editorTabId(id: string): MarkdownEditorTab {
  return `Editor:${id}`
}

export function isEditorTab(tab: Tab): tab is MarkdownEditorTab {
  return tab.startsWith('Editor:')
}

export function editorIdFromTab(tab: Tab): string | null {
  return isEditorTab(tab) ? tab.slice('Editor:'.length) : null
}

function sameMarkdownIdentity(a: MarkdownEditorSession, b: MarkdownFileIdentity): boolean {
  if ('absolutePath' in a && a.absolutePath && 'absolutePath' in b && b.absolutePath) {
    return a.absolutePath === b.absolutePath
  }
  if ('workspacePath' in a && a.workspacePath && 'workspacePath' in b && b.workspacePath) {
    return a.workspacePath === b.workspacePath && a.relativePath === b.relativePath
  }
  return false
}

function tabExists(tab: Tab, editors: MarkdownEditorSession[]): boolean {
  if (!isEditorTab(tab)) return true
  const id = editorIdFromTab(tab)
  return Boolean(id && editors.some(editor => editor.id === id))
}

function fallbackTab(editors: MarkdownEditorSession[], preferred?: NavSnapshot): Tab {
  if (preferred && tabExists(preferred.tab, editors)) return preferred.tab
  const lastEditor = editors[editors.length - 1]
  return lastEditor ? editorTabId(lastEditor.id) : 'Dashboard'
}

export const useNavigationStore = create<NavigationState>((set, get) => ({
  activeTab: 'Dashboard',
  selectedWorkspaceId: null,
  aiConfigWorkspaceId: null,
  markdownEditors: [],
  markdownCloseRequestedId: null,
  navHistory: [],

  setSelectedWorkspaceId: (id) => set({ selectedWorkspaceId: id }),
  setAiConfigWorkspaceId: (id) => set({ aiConfigWorkspaceId: id }),

  handleTabChange: (tab) => {
    if (isEditorTab(tab)) {
      set({ activeTab: tab, markdownCloseRequestedId: null })
      return
    }
    set({ activeTab: tab, selectedWorkspaceId: null, navHistory: [] })
  },

  navigateToAIConfig: (workspaceId) => {
    const { activeTab, selectedWorkspaceId, aiConfigWorkspaceId, navHistory } = get()
    set({
      navHistory: [...navHistory, { tab: activeTab, selectedWorkspaceId, aiConfigWorkspaceId }],
      aiConfigWorkspaceId: workspaceId,
      activeTab: 'AI Configs',
    })
  },

  openMarkdownEditor: (session) => {
    const { activeTab, selectedWorkspaceId, aiConfigWorkspaceId, navHistory, markdownEditors } = get()
    const existing = markdownEditors.find(editor => sameMarkdownIdentity(editor, session))
    if (existing) {
      set({ activeTab: editorTabId(existing.id), markdownCloseRequestedId: null })
      return
    }

    const id = session.id ?? makeEditorId()
    const nextEditor = { ...session, id } as MarkdownEditorSession
    const nextHistory = isEditorTab(activeTab)
      ? navHistory
      : [...navHistory, { tab: activeTab, selectedWorkspaceId, aiConfigWorkspaceId }]
    set({
      navHistory: nextHistory,
      markdownEditors: [...markdownEditors, nextEditor],
      markdownCloseRequestedId: null,
      activeTab: editorTabId(id),
    })
  },

  updateMarkdownEditor: (id, patch) => {
    const { markdownEditors } = get()
    set({
      markdownEditors: markdownEditors.map(editor => {
        if (editor.id !== id) return editor
        return typeof patch === 'function'
          ? patch(editor)
          : { ...editor, ...patch }
      }),
    })
  },

  requestCloseMarkdownEditor: (id) => set({ markdownCloseRequestedId: id }),

  cancelCloseMarkdownEditor: () => set({ markdownCloseRequestedId: null }),

  closeMarkdownEditor: (id) => {
    const { navHistory, markdownEditors, activeTab } = get()
    const nextEditors = markdownEditors.filter(editor => editor.id !== id)
    const prev = navHistory[navHistory.length - 1]
    const closingActive = activeTab === editorTabId(id)
    const nextTab = closingActive ? fallbackTab(nextEditors, prev) : activeTab
    set({
      markdownEditors: nextEditors,
      markdownCloseRequestedId: null,
      navHistory: closingActive && prev ? navHistory.slice(0, -1) : navHistory,
      activeTab: nextTab,
      selectedWorkspaceId: closingActive && prev ? prev.selectedWorkspaceId : get().selectedWorkspaceId,
      aiConfigWorkspaceId: closingActive && prev ? prev.aiConfigWorkspaceId : get().aiConfigWorkspaceId,
    })
  },

  goBack: () => {
    const { navHistory, activeTab, selectedWorkspaceId, aiConfigWorkspaceId } = get()
    const editorId = editorIdFromTab(activeTab)
    if (editorId) {
      set({ markdownCloseRequestedId: editorId })
      return
    }
    if (navHistory.length > 0) {
      const prev = navHistory[navHistory.length - 1]
      set({
        navHistory: navHistory.slice(0, -1),
        activeTab: prev.tab,
        selectedWorkspaceId: prev.selectedWorkspaceId,
        aiConfigWorkspaceId: prev.aiConfigWorkspaceId,
      })
      return
    }
    if (activeTab === 'Dashboard' && selectedWorkspaceId) {
      set({ selectedWorkspaceId: null })
    } else if (activeTab === 'AI Configs' && aiConfigWorkspaceId) {
      set({ aiConfigWorkspaceId: null })
    }
  },
}))
