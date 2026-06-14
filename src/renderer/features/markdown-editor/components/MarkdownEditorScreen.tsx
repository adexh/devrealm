import { useEffect } from 'react'
import type { MarkdownFileIdentity, MarkdownFileWriteRequest } from '../../../../shared/types'
import { Box, Btn, Chip, Heading, Modal, Mono } from '../../../components/ui'
import { editorIdFromTab, useNavigationStore, type MarkdownEditorSession } from '../../../stores/navigationStore'
import { MarkdownEditor } from './MarkdownEditor'

function sessionKey(session: MarkdownEditorSession): string {
  return hasAbsolutePath(session)
    ? session.absolutePath
    : `${session.workspacePath}/${session.relativePath}`
}

function hasAbsolutePath(session: MarkdownEditorSession): session is MarkdownEditorSession & { absolutePath: string } {
  return Boolean((session as { absolutePath?: string }).absolutePath)
}

function hasWorkspacePath(session: MarkdownEditorSession): session is MarkdownEditorSession & { workspacePath: string; relativePath: string } {
  return Boolean((session as { workspacePath?: string }).workspacePath)
}

function writeRequest(session: MarkdownEditorSession, content: string): MarkdownFileWriteRequest {
  if (hasAbsolutePath(session)) {
    return { absolutePath: session.absolutePath, content }
  }
  if (!hasWorkspacePath(session)) throw new Error('Markdown workspace path is missing.')
  return {
    workspacePath: session.workspacePath,
    relativePath: session.relativePath,
    content,
  }
}

function displayPath(session: MarkdownEditorSession): string {
  if (session.pathLabel) return session.pathLabel
  if (hasWorkspacePath(session)) return session.relativePath
  return session.absolutePath
}

function sameIdentity(a: MarkdownEditorSession, b: MarkdownFileIdentity): boolean {
  if ('absolutePath' in a && a.absolutePath && 'absolutePath' in b && b.absolutePath) {
    return a.absolutePath === b.absolutePath
  }
  if ('workspacePath' in a && a.workspacePath && 'workspacePath' in b && b.workspacePath) {
    return a.workspacePath === b.workspacePath && a.relativePath === b.relativePath
  }
  return false
}

export function MarkdownEditorScreen() {
  const {
    activeTab,
    markdownEditors,
    markdownCloseRequestedId,
    updateMarkdownEditor,
    requestCloseMarkdownEditor,
    cancelCloseMarkdownEditor,
    closeMarkdownEditor,
  } = useNavigationStore()

  const activeEditorId = editorIdFromTab(activeTab)
  const editor = activeEditorId
    ? markdownEditors.find(session => session.id === activeEditorId) ?? null
    : null
  const dirty = editor ? editor.content !== editor.savedContent : false

  useEffect(() => {
    if (!editor || editor.isDraft || !editor.loading) return

    const identity: MarkdownFileIdentity = hasAbsolutePath(editor)
      ? { absolutePath: editor.absolutePath }
      : { workspacePath: editor.workspacePath, relativePath: editor.relativePath }
    let cancelled = false

    window.electronAPI.markdown.readFile(identity)
      .then(file => {
        if (cancelled) return
        updateMarkdownEditor(editor.id, current => {
          if (!sameIdentity(current, identity)) return current
          return {
            ...current,
            content: file.content,
            savedContent: file.content,
            loading: false,
            error: null,
          }
        })
      })
      .catch(error => {
        if (cancelled) return
        updateMarkdownEditor(editor.id, current => {
          if (!sameIdentity(current, identity)) return current
          return {
            ...current,
            loading: false,
            error: error instanceof Error ? error.message : 'Unable to read Markdown file.',
          }
        })
      })

    return () => { cancelled = true }
  }, [editor, updateMarkdownEditor])

  useEffect(() => {
    if (!editor || markdownCloseRequestedId !== editor.id || dirty) return
    closeMarkdownEditor(editor.id)
  }, [closeMarkdownEditor, dirty, editor, markdownCloseRequestedId])

  async function saveEditor() {
    if (!editor || editor.loading || editor.saving || !dirty) return
    const content = editor.content
    updateMarkdownEditor(editor.id, { saving: true, error: null })

    try {
      if (editor.isDraft) {
        await window.electronAPI.markdown.createFile(writeRequest(editor, content))
      } else {
        await window.electronAPI.markdown.writeFile(writeRequest(editor, content))
      }
      updateMarkdownEditor(editor.id, {
        savedContent: content,
        saving: false,
        error: null,
        isDraft: false,
      })
    } catch (error) {
      updateMarkdownEditor(editor.id, {
        saving: false,
        error: error instanceof Error ? error.message : 'Unable to save Markdown file.',
      })
    }
  }

  async function saveThenClose() {
    if (!editor) return
    const id = editor.id
    await saveEditor()
    const latest = useNavigationStore.getState().markdownEditors.find(session => session.id === id)
    if (latest && latest.content === latest.savedContent && !latest.error) {
      closeMarkdownEditor(id)
    }
  }

  if (!editor) {
    return (
      <div className="flex-1 flex items-center justify-center text-t-ink-soft text-[13px]">
        No Markdown file is open.
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-6 py-3.5 border-b border-t-line flex items-center gap-3 flex-none">
        <Heading size={15}>Editor</Heading>
        <Mono size={11} soft className="truncate">{displayPath(editor)}</Mono>
        {dirty ? <Chip accent>Unsaved changes</Chip> : <Mono size={11} soft>Saved</Mono>}
        {editor.isDraft && <Chip>new file</Chip>}
        <div className="flex-1" />
        <Btn onClick={() => requestCloseMarkdownEditor(editor.id)}>Close</Btn>
        <Btn primary onClick={saveEditor} style={{ opacity: dirty && !editor.saving && !editor.loading ? 1 : 0.45 }}>
          {editor.saving ? 'Saving...' : 'Save'}
        </Btn>
      </div>

      <div className="flex-1 overflow-auto p-5">
        <Box className="p-4 bg-t-panel">
          <div className="mb-3 flex items-baseline gap-2 min-w-0">
            <Heading size={16} className="truncate">{editor.name}</Heading>
            <Mono size={11} soft className="truncate">{displayPath(editor)}</Mono>
          </div>

          {editor.loading ? (
            <Mono size={12} soft>Loading Markdown...</Mono>
          ) : editor.error ? (
            <div className="text-[11px] text-[#e05252] px-2 py-1.5 border border-[#e05252] rounded-[3px]">
              {editor.error}
            </div>
          ) : (
            <MarkdownEditor
              key={sessionKey(editor)}
              value={editor.content}
              onChange={content => updateMarkdownEditor(editor.id, { content })}
              minHeight="min(620px, calc(100vh - 230px))"
              maxHeight="min(820px, calc(100vh - 230px))"
              autoFocus
            />
          )}
        </Box>
      </div>

      {markdownCloseRequestedId === editor.id && dirty && (
        <Modal title="Unsaved changes" onClose={cancelCloseMarkdownEditor} width={420}>
          <div className="flex flex-col gap-3">
            <div className="text-[13px] leading-relaxed text-t-ink-soft">
              Save changes to <Mono size={12}>{editor.name}</Mono> before closing, or discard them.
            </div>
            <div className="flex justify-end gap-2">
              <Btn onClick={cancelCloseMarkdownEditor}>Cancel</Btn>
              <Btn onClick={() => closeMarkdownEditor(editor.id)}>Discard</Btn>
              <Btn primary onClick={() => { void saveThenClose() }}>
                {editor.saving ? 'Saving...' : 'Save'}
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
