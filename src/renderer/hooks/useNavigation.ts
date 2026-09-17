import { useEffect } from 'react'
import { useNavigationStore } from '../stores/navigationStore'
import { useUiStore } from '../stores/uiStore'

export function useNavigation() {
  const goBack = useNavigationStore(s => s.goBack)
  const handleTabChange = useNavigationStore(s => s.handleTabChange)
  const setSelectedWorkspaceId = useNavigationStore(s => s.setSelectedWorkspaceId)
  const openGlobalSearch = useUiStore(s => s.openGlobalSearch)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        openGlobalSearch()
        return
      }
      if (e.metaKey && e.key === 'Escape') setSelectedWorkspaceId(null)
      // Shift makes event.key uppercase, so these compared against a letter
      // that can never arrive and none of them had ever fired.
      if (e.metaKey && e.shiftKey) {
        const key = e.key.toLowerCase()
        if (key === 'd') handleTabChange('Dashboard')
        if (key === 'a') handleTabChange('AI Configs')
        if (key === 't') handleTabChange('Terminals')
      }
      if (e.key === 'Backspace' && !e.metaKey && !e.altKey && !e.ctrlKey) {
        const tag = (e.target as HTMLElement).tagName
        const isEditable = (e.target as HTMLElement).isContentEditable
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !isEditable) {
          e.preventDefault()
          goBack()
        }
      }
    }

    function onMouse(e: MouseEvent) {
      if (e.button === 3) {
        e.preventDefault()
        goBack()
      }
    }

    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onMouse)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onMouse)
    }
  }, [goBack, handleTabChange, setSelectedWorkspaceId, openGlobalSearch])
}
