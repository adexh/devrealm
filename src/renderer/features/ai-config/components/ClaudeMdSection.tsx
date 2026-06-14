import { useState } from 'react'
import type { ClaudeMdFile, ClaudeMdSnapshot } from '../../../../shared/types'
import { Box, Btn, Chip, Heading, Label, Mono, FolderIcon, AIIcon, InfoPopover } from '../../../components/ui'
import { useNavigationStore } from '../../../stores/navigationStore'
import { CLAUDE_MD_CATALOG, type ClaudeMdRootSlot, type ClaudeMdFolderSlot } from '../catalog/claudeMdCatalog'

export function ClaudeMdSection({
  workspacePath,
  snapshot,
  loading,
}: {
  workspacePath?: string
  snapshot: ClaudeMdSnapshot | null
  loading: boolean
}) {
  const { openMarkdownEditor } = useNavigationStore()
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const [newFileName, setNewFileName] = useState('')
  const [sectionError, setSectionError] = useState<string | null>(null)

  function openEditor(file: Pick<ClaudeMdFile, 'absolutePath' | 'relativePath' | 'name'>) {
    setSectionError(null)
    openMarkdownEditor({
      absolutePath: file.absolutePath,
      pathLabel: file.relativePath,
      name: file.name,
      content: '',
      savedContent: '',
      loading: true,
      saving: false,
      error: null,
    })
  }

  function handleCreate(slot: ClaudeMdRootSlot) {
    if (!workspacePath) return
    setSectionError(null)
    openMarkdownEditor({
      workspacePath,
      relativePath: slot.relativePath,
      name: slot.label,
      content: slot.starterTemplate,
      savedContent: '',
      loading: false,
      saving: false,
      error: null,
      isDraft: true,
    })
  }

  function handleAdd(slot: ClaudeMdFolderSlot, rawName: string) {
    if (!workspacePath || !rawName.trim()) return
    const baseName = rawName.trim().replace(/\.md$/, '')
    if (baseName.includes('/') || baseName.includes('\\') || baseName === '..' || baseName.includes('..')) {
      setSectionError('Use a simple Markdown file name without folders or "..".')
      return
    }

    setSectionError(null)
    const fileName = `${baseName}.md`
    const relativePath = `${slot.folderRelPath}/${fileName}`
    const content = slot.starterTemplate.replace(/\{name\}/g, baseName)
    openMarkdownEditor({
      workspacePath,
      relativePath,
      name: fileName,
      content,
      savedContent: '',
      loading: false,
      saving: false,
      error: null,
      isDraft: true,
    })
    setAddingTo(null)
    setNewFileName('')
  }

  const rootSlots = CLAUDE_MD_CATALOG.filter((s): s is ClaudeMdRootSlot => s.kind === 'rootFile')
  const folderSlots = CLAUDE_MD_CATALOG.filter((s): s is ClaudeMdFolderSlot => s.kind === 'folder')

  return (
    <Box className="p-4 bg-t-panel">
      <div className="flex items-center gap-2">
        <AIIcon size={15} />
        <Heading size={14}>Claude .md files</Heading>
        <InfoPopover
          title="Claude .md files"
          description="These Markdown files are read by Claude Code at session start. Create or edit rules, skills, commands, agents, and output styles directly in this workspace."
        />
      </div>

      {sectionError && (
        <div className="mt-3 text-[11px] text-[#e05252] px-2 py-1.5 border border-[#e05252] rounded-[3px]">
          {sectionError}
        </div>
      )}

      {loading && <Mono size={12} soft className="block mt-3">Scanning .md files…</Mono>}

      {!loading && snapshot && (
        <div className="mt-3 flex flex-col gap-4">

          <div className="flex flex-col gap-1">
            <Label>Root files</Label>
            {rootSlots.map(slot => {
              const fileData = snapshot.rootFiles.find(f => f.relativePath === slot.relativePath)
              const exists = fileData?.exists ?? false
              return (
                <div key={slot.relativePath}>
                  <div className="flex items-center gap-3 py-1.5">
                    <Mono size={12} className="w-40 shrink-0">{slot.relativePath}</Mono>
                    <InfoPopover title={slot.label} description={slot.description} />
                    {exists
                      ? <Chip accent>configured</Chip>
                      : <Chip>not created</Chip>}
                    <div className="flex-1" />
                    {exists
                      ? <Btn onClick={() => openEditor(fileData!)}>Open</Btn>
                      : <Btn primary onClick={() => handleCreate(slot)}>Create</Btn>}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="grid grid-cols-2 gap-3 items-start">
            {folderSlots.map(slot => {
              const folderData = snapshot.folders.find(f => f.folderRelPath === slot.folderRelPath)
              const files = folderData?.files ?? []
              const isAdding = addingTo === slot.folderRelPath

              return (
                <div key={slot.folderRelPath} className="flex flex-col gap-1.5 rounded border border-t-line bg-t-panel p-3">
                  <div className="flex items-center gap-2">
                    <Label>{slot.label}</Label>
                    <Mono size={10} soft>{slot.folderRelPath}</Mono>
                    <InfoPopover title={slot.label} description={slot.description} />
                    {files.length > 0 && (
                      <span className="ml-auto text-[10px] text-t-ink-soft bg-t-bg border border-t-line rounded-full px-2 py-px">
                        {files.length}
                      </span>
                    )}
                  </div>

                  {files.length > 0 && (
                    <div className="mt-1 rounded border border-t-line bg-t-bg overflow-hidden">
                      <div
                        className="overflow-y-auto"
                        style={{ maxHeight: '9rem' }}
                      >
                        {files.map((file, i) => (
                          <div
                            key={file.relativePath}
                            className={`flex items-center gap-2 px-2.5 py-1.5${i < files.length - 1 ? ' border-b border-t-line' : ''}`}
                          >
                            <FolderIcon size={11} />
                            <Mono size={11} className="flex-1 truncate">{file.name}</Mono>
                            <Btn onClick={() => openEditor(file)}>Open</Btn>
                          </div>
                        ))}
                      </div>
                      {files.length > 5 && (
                        <div className="px-2.5 py-1 border-t border-t-line bg-t-panel">
                          <Mono size={10} soft>{files.length} files · scroll to see all</Mono>
                        </div>
                      )}
                    </div>
                  )}

                  {isAdding ? (
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        autoFocus
                        value={newFileName}
                        onChange={e => setNewFileName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') void handleAdd(slot, newFileName)
                          if (e.key === 'Escape') { setAddingTo(null); setNewFileName(''); setSectionError(null) }
                        }}
                        placeholder={slot.newFileNamePlaceholder}
                        className="h-7 border border-t-line rounded px-2.5 text-[12px] bg-t-bg text-t-ink font-mono outline-none"
                      />
                      <Mono size={11} soft>.md</Mono>
                      <Btn primary onClick={() => handleAdd(slot, newFileName)}>Add</Btn>
                      <Btn onClick={() => { setAddingTo(null); setNewFileName(''); setSectionError(null) }}>Cancel</Btn>
                    </div>
                  ) : (
                    <Btn onClick={() => { setAddingTo(slot.folderRelPath); setNewFileName('') }}>
                      + Add {slot.itemLabel}
                    </Btn>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </Box>
  )
}
