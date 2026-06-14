export type SkillInvocationMode = 'auto-and-manual' | 'manual-only' | 'auto-only'

export type SkillFormState = {
  name: string
  description: string
  whenToUse: string
  invocationMode: SkillInvocationMode
  argumentHint: string
  argumentsText: string
  allowedTools: string
  model: string
  effort: string
  context: string
  instructions: string
}
