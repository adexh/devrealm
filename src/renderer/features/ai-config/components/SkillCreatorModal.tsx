import { useState } from 'react'
import { Btn, Modal, Mono } from '../../../components/ui'
import { useNavigationStore } from '../../../stores/navigationStore'
import {
  buildSkillMarkdown,
  DEFAULT_SKILL_FORM,
  skillFormError,
  skillPathForName,
} from '../constants/skillCreator'
import { skillFileExists } from '../ipc/skills'
import type { SkillFormState, SkillInvocationMode } from '../types/skillCreator'
import { SkillCreatorField } from './SkillCreatorField'

const inputClass = 'h-8 border border-t-line rounded px-2.5 text-[12px] bg-t-bg text-t-ink outline-none w-full box-border'
const monoInputClass = 'h-8 border border-t-line rounded px-2.5 text-[12px] bg-t-bg text-t-ink outline-none w-full box-border font-mono'
const textareaClass = 'border border-t-line rounded px-2.5 py-2 text-[12px] bg-t-bg text-t-ink outline-none resize-y w-full box-border leading-[1.5]'

export function SkillCreatorModal({
  workspacePath,
  onClose,
}: {
  workspacePath: string
  onClose: () => void
}) {
  const { openMarkdownEditor, markdownEditors } = useNavigationStore()
  const [form, setForm] = useState<SkillFormState>(DEFAULT_SKILL_FORM)
  const [error, setError] = useState<string | null>(null)

  function updateForm(patch: Partial<SkillFormState>) {
    setForm(prev => ({ ...prev, ...patch }))
    setError(null)
  }

  function closeModal() {
    setError(null)
    onClose()
  }

  async function handleOpenDraft() {
    const validationError = skillFormError(form)
    if (validationError) {
      setError(validationError)
      return
    }

    const name = form.name.trim()
    const relativePath = skillPathForName(name)
    const alreadyOpen = markdownEditors.some(editor =>
      'workspacePath' in editor &&
      editor.workspacePath === workspacePath &&
      editor.relativePath === relativePath
    )

    if (alreadyOpen) {
      setError('This skill is already open in the Markdown editor.')
      return
    }

    try {
      if (await skillFileExists(workspacePath, relativePath)) {
        setError('A skill already exists at this path.')
        return
      }
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : 'Unable to check whether this skill already exists.')
      return
    }

    openMarkdownEditor({
      workspacePath,
      relativePath,
      pathLabel: relativePath,
      name: `${name}/SKILL.md`,
      content: buildSkillMarkdown({ ...form, name }),
      savedContent: '',
      loading: false,
      saving: false,
      error: null,
      isDraft: true,
    })
    closeModal()
  }

  const skillPathPreview = form.name.trim()
    ? skillPathForName(form.name.trim())
    : '.claude/skills/<skill-name>/SKILL.md'

  return (
    <Modal title="Create Skill" onClose={closeModal} width={760}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <SkillCreatorField label="Skill name" hint="Lowercase letters, numbers, and hyphens. This becomes the slash command name.">
            <input
              autoFocus
              value={form.name}
              onChange={event => updateForm({ name: event.target.value.trim().toLowerCase() })}
              placeholder="review-pr"
              className={monoInputClass}
            />
          </SkillCreatorField>
          <SkillCreatorField label="Path">
            <div className="h-8 border border-t-line rounded px-2.5 bg-t-panel flex items-center min-w-0">
              <Mono size={11} soft className="truncate">{skillPathPreview}</Mono>
            </div>
          </SkillCreatorField>
        </div>

        <SkillCreatorField label="Description" hint="Front-load what the skill does and when Claude should use it.">
          <input
            value={form.description}
            onChange={event => updateForm({ description: event.target.value })}
            placeholder="Review pull requests for correctness, regressions, and missing tests."
            className={inputClass}
          />
        </SkillCreatorField>

        <SkillCreatorField label="Instructions">
          <textarea
            value={form.instructions}
            onChange={event => updateForm({ instructions: event.target.value })}
            placeholder="Write the workflow Claude should follow when this skill is invoked..."
            rows={7}
            className={textareaClass}
          />
        </SkillCreatorField>

        <div className="grid grid-cols-3 gap-3">
          <SkillCreatorField label="Invocation">
            <select
              value={form.invocationMode}
              onChange={event => updateForm({ invocationMode: event.target.value as SkillInvocationMode })}
              className={inputClass}
            >
              <option value="auto-and-manual">Claude and user</option>
              <option value="manual-only">Manual only</option>
              <option value="auto-only">Claude only</option>
            </select>
          </SkillCreatorField>
          <SkillCreatorField label="Argument hint">
            <input
              value={form.argumentHint}
              onChange={event => updateForm({ argumentHint: event.target.value })}
              placeholder="[issue-number]"
              className={monoInputClass}
            />
          </SkillCreatorField>
          <SkillCreatorField label="Arguments">
            <input
              value={form.argumentsText}
              onChange={event => updateForm({ argumentsText: event.target.value })}
              placeholder="issue, branch"
              className={monoInputClass}
            />
          </SkillCreatorField>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <SkillCreatorField label="Allowed tools">
            <input
              value={form.allowedTools}
              onChange={event => updateForm({ allowedTools: event.target.value })}
              placeholder="Read Grep"
              className={monoInputClass}
            />
          </SkillCreatorField>
          <SkillCreatorField label="Model">
            <input
              value={form.model}
              onChange={event => updateForm({ model: event.target.value })}
              placeholder="inherit"
              className={monoInputClass}
            />
          </SkillCreatorField>
          <SkillCreatorField label="Effort">
            <select
              value={form.effort}
              onChange={event => updateForm({ effort: event.target.value })}
              className={inputClass}
            >
              <option value="">Inherit</option>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="xhigh">xhigh</option>
              <option value="max">max</option>
            </select>
          </SkillCreatorField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <SkillCreatorField label="When to use">
            <textarea
              value={form.whenToUse}
              onChange={event => updateForm({ whenToUse: event.target.value })}
              rows={3}
              placeholder="Optional trigger phrases or additional invocation guidance."
              className={textareaClass}
            />
          </SkillCreatorField>
          <SkillCreatorField label="Context">
            <select
              value={form.context}
              onChange={event => updateForm({ context: event.target.value })}
              className={inputClass}
            >
              <option value="">Inline</option>
              <option value="fork">Forked subagent</option>
            </select>
          </SkillCreatorField>
        </div>

        {error && (
          <div className="text-[11px] text-[#e05252] px-2 py-1.5 border border-[#e05252] rounded-[3px]">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Btn onClick={closeModal}>Cancel</Btn>
          <Btn primary onClick={() => { void handleOpenDraft() }}>
            Open Draft
          </Btn>
        </div>
      </div>
    </Modal>
  )
}
