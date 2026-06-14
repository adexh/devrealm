import type { SkillFormState } from '../types/skillCreator'

export const DEFAULT_SKILL_FORM: SkillFormState = {
  name: '',
  description: '',
  whenToUse: '',
  invocationMode: 'auto-and-manual',
  argumentHint: '',
  argumentsText: '',
  allowedTools: '',
  model: '',
  effort: '',
  context: '',
  instructions: '',
}

export const SKILL_NAME_PATTERN = /^[a-z0-9-]{1,64}$/

function yamlString(value: string): string {
  return JSON.stringify(value)
}

function yamlList(raw: string): string | null {
  const parts = raw
    .split(/[\n,]/)
    .map(part => part.trim())
    .filter(Boolean)

  if (parts.length === 0) return null
  return `[${parts.map(yamlString).join(', ')}]`
}

export function skillPathForName(name: string): string {
  return `.claude/skills/${name}/SKILL.md`
}

export function buildSkillMarkdown(form: SkillFormState): string {
  const frontmatter = [
    ['name', yamlString(form.name.trim())],
    ['description', yamlString(form.description.trim())],
  ]

  const whenToUse = form.whenToUse.trim()
  const argumentHint = form.argumentHint.trim()
  const argumentsList = yamlList(form.argumentsText)
  const allowedTools = form.allowedTools.trim()
  const model = form.model.trim()
  const effort = form.effort.trim()
  const context = form.context.trim()

  if (whenToUse) frontmatter.push(['when_to_use', yamlString(whenToUse)])
  if (argumentHint) frontmatter.push(['argument-hint', yamlString(argumentHint)])
  if (argumentsList) frontmatter.push(['arguments', argumentsList])
  if (form.invocationMode === 'manual-only') frontmatter.push(['disable-model-invocation', 'true'])
  if (form.invocationMode === 'auto-only') frontmatter.push(['user-invocable', 'false'])
  if (allowedTools) frontmatter.push(['allowed-tools', yamlString(allowedTools)])
  if (model) frontmatter.push(['model', yamlString(model)])
  if (effort) frontmatter.push(['effort', yamlString(effort)])
  if (context) frontmatter.push(['context', yamlString(context)])

  return [
    '---',
    ...frontmatter.map(([key, value]) => `${key}: ${value}`),
    '---',
    '',
    `# ${form.name.trim()}`,
    '',
    form.instructions.trim(),
    '',
    '## Supporting files',
    '',
    'Add optional `references/`, `scripts/`, or `assets/` files beside this `SKILL.md` when the skill needs reusable material. Reference those files here so Claude knows when to load or run them.',
    '',
  ].join('\n')
}

export function skillFormError(form: SkillFormState): string | null {
  const name = form.name.trim()
  if (!name) return 'Skill name is required.'
  if (!SKILL_NAME_PATTERN.test(name)) return 'Use lowercase letters, numbers, and hyphens only, up to 64 characters.'
  if (!form.description.trim()) return 'Description is required.'
  if (!form.instructions.trim()) return 'Instructions are required.'
  return null
}
