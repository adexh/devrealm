import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UiState {
  dark: boolean
  setDark: (dark: boolean) => void
  globalSearchOpen: boolean
  globalSearchQuery: string
  highlightedIndex: number
  globalSearchError: string | null
  openGlobalSearch: () => void
  closeGlobalSearch: () => void
  setGlobalSearchQuery: (query: string) => void
  setHighlightedIndex: (index: number) => void
  setGlobalSearchError: (error: string | null) => void
  /** The macOS Accessibility banner on the IDEs tab, once dismissed, stays dismissed. */
  ideAccessibilityBannerDismissed: boolean
  dismissIdeAccessibilityBanner: () => void
  knowledgeBaseCollapsed: boolean
  toggleKnowledgeBase: () => void
  knowledgeBaseWidth: number
  setKnowledgeBaseWidth: (width: number) => void
}

const KNOWLEDGE_BASE_WIDTH = { min: 220, default: 288, max: 640 }

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      dark: false,
      setDark: (dark) => {
        set({ dark })
        void window.electronAPI.settings.setDarkMode(dark)
      },
      globalSearchOpen: false,
      globalSearchQuery: '',
      highlightedIndex: 0,
      globalSearchError: null,
      openGlobalSearch: () => set({ globalSearchOpen: true }),
      closeGlobalSearch: () => set({ globalSearchOpen: false, globalSearchQuery: '', highlightedIndex: 0 }),
      setGlobalSearchQuery: (query) => set({ globalSearchQuery: query }),
      setHighlightedIndex: (index) => set({ highlightedIndex: index }),
      setGlobalSearchError: (error) => set({ globalSearchError: error }),
      ideAccessibilityBannerDismissed: false,
      dismissIdeAccessibilityBanner: () => set({ ideAccessibilityBannerDismissed: true }),
      knowledgeBaseCollapsed: false,
      toggleKnowledgeBase: () => set((state) => ({ knowledgeBaseCollapsed: !state.knowledgeBaseCollapsed })),
      knowledgeBaseWidth: KNOWLEDGE_BASE_WIDTH.default,
      setKnowledgeBaseWidth: (width) => set({
        knowledgeBaseWidth: Math.round(Math.min(KNOWLEDGE_BASE_WIDTH.max, Math.max(KNOWLEDGE_BASE_WIDTH.min, width))),
      }),
    }),
    {
      name: 'ui-settings',
      partialize: (state) => ({
        dark: state.dark,
        ideAccessibilityBannerDismissed: state.ideAccessibilityBannerDismissed,
        knowledgeBaseCollapsed: state.knowledgeBaseCollapsed,
        knowledgeBaseWidth: state.knowledgeBaseWidth,
      }),
    }
  )
)
