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
}

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
    }),
    {
      name: 'ui-settings',
      partialize: (state) => ({ dark: state.dark }),
    }
  )
)
