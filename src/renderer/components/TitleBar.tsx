import React from 'react'

const platform = window.electronAPI.platform

export function TitleBar({ rightSlot }: { rightSlot?: React.ReactNode }) {
  return (
    <div
      className="flex-none flex items-center border-b border-t-line bg-t-bg relative"
      style={{ height: 40, WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Reserve space for macOS traffic lights */}
      {platform === 'darwin' && <div style={{ width: 80 }} />}

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
        <span className="text-[12px] font-semibold text-t-ink-soft tracking-wide">DevRealm</span>
      </div>

      {rightSlot && (
        <div
          className="ml-auto flex items-center gap-1 px-2"
          style={{
            WebkitAppRegion: 'no-drag',
            // Leave room for native min/max/close buttons on Windows
            paddingRight: platform === 'win32' ? 148 : 8,
          } as React.CSSProperties}
        >
          {rightSlot}
        </div>
      )}
    </div>
  )
}
