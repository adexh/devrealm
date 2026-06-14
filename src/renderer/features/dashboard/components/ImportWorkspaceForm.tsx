import { useState } from 'react'
import { Box, Btn, FolderIcon } from '../../../components/ui'
import { browseWorkspaceDir, browseWorkspaceImportFile, importWorkspace } from '../ipc/workspaces'

export function ImportWorkspaceForm({
  onImported,
  onCancel,
}: {
  onImported: () => void
  onCancel?: () => void
}) {
  const [rootPath, setRootPath] = useState('')
  const [filePath, setFilePath] = useState('')
  const [loading, setLoading] = useState(false)

  async function browseFile() {
    const file = await browseWorkspaceImportFile()
    if (file) setFilePath(file)
  }

  async function browseDir() {
    const dir = await browseWorkspaceDir()
    if (dir) setRootPath(dir)
  }

  async function handleImport() {
    if (!rootPath || !filePath) return
    setLoading(true)
    try {
      const result = await importWorkspace({ rootPath, filePath })
      if (result) onImported()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs text-t-ink-soft leading-normal">
        Select a workspace export file, then choose where the imported workspace folder should be created.
      </div>
      <div className="flex gap-1.5 items-center">
        <Box className="flex-1 h-9 flex items-center px-3 gap-2">
          <span className="text-[11px] font-semibold text-t-ink-soft">GZ</span>
          <span
            className={`text-xs flex-1 overflow-hidden text-ellipsis whitespace-nowrap ${filePath ? 'text-t-ink' : 'text-t-ink-softer'}`}
          >
            {filePath || 'Select .gz workspace export…'}
          </span>
        </Box>
        <Btn onClick={browseFile} className="shrink-0">
          Browse…
        </Btn>
      </div>
      {filePath && (
        <div className="flex gap-1.5 items-center">
          <Box className="flex-1 h-9 flex items-center px-3 gap-2">
            <FolderIcon />
            <span
              className={`text-xs flex-1 overflow-hidden text-ellipsis whitespace-nowrap ${rootPath ? 'text-t-ink' : 'text-t-ink-softer'}`}
            >
              {rootPath || '~/Select destination…'}
            </span>
          </Box>
          <Btn onClick={browseDir} className="shrink-0">
            Browse…
          </Btn>
        </div>
      )}
      <div className="flex gap-2">
        <Btn
          primary
          onClick={handleImport}
          style={{ opacity: rootPath && filePath ? 1 : 0.5 }}
        >
          {loading ? 'Importing…' : 'Import workspace'}
        </Btn>
        {onCancel && <Btn onClick={onCancel}>Cancel</Btn>}
      </div>
    </div>
  )
}
