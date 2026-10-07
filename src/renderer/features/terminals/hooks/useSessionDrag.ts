import type { DragEvent } from 'react'
import { useTerminalStore } from '../../../stores/terminalStore'
import { SESSION_DRAG_TYPE } from '../constants'

export function useSessionDrag(sessionId: string) {
  const setDraggedSession = useTerminalStore(state => state.setDraggedSession)

  return {
    draggable: true,
    onDragStart: (event: DragEvent) => {
      event.dataTransfer.setData(SESSION_DRAG_TYPE, sessionId)
      event.dataTransfer.effectAllowed = 'move'
      // Chromium cancels a drag whose dragstart changes the DOM, and the drop
      // overlays mounting would do exactly that.
      setTimeout(() => setDraggedSession(sessionId), 0)
    },
    onDragEnd: () => setDraggedSession(null),
  }
}
