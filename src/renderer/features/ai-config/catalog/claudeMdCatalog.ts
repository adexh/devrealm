export type ClaudeMdRootSlot = {
  kind: 'rootFile'
  relativePath: string
  label: string
  description: string
  starterTemplate: string
}

export type ClaudeMdFolderSlot = {
  kind: 'folder'
  folderRelPath: string
  label: string
  description: string
  itemLabel: string
  newFileNamePlaceholder: string
  starterTemplate: string
}

export type ClaudeMdSlot = ClaudeMdRootSlot | ClaudeMdFolderSlot

export const CLAUDE_MD_CATALOG: ClaudeMdSlot[] = [
  {
    kind: 'rootFile',
    relativePath: 'CLAUDE.md',
    label: 'CLAUDE.md',
    description: 'Shared project instructions committed with the repo. Claude reads this at every session start.',
    starterTemplate: '# Project Instructions\n\n<!-- Add shared instructions for Claude here -->\n',
  },
  {
    kind: 'rootFile',
    relativePath: 'CLAUDE.local.md',
    label: 'CLAUDE.local.md',
    description: 'Personal local-only instructions. Add to .gitignore so it stays off the repo.',
    starterTemplate: '# Local Instructions\n\n<!-- Personal instructions for Claude that stay off the repo -->\n',
  },
  {
    kind: 'folder',
    folderRelPath: '.claude/rules',
    label: 'Rules',
    description: 'Each .md file is a named rule injected into every Claude session.',
    itemLabel: 'rule',
    newFileNamePlaceholder: 'my-rule',
    starterTemplate: '# Rule: {name}\n\n<!-- Describe the rule Claude should follow -->\n',
  },
  {
    kind: 'folder',
    folderRelPath: '.claude/skills',
    label: 'Skills',
    description: 'Each .md file defines a skill Claude can invoke.',
    itemLabel: 'skill',
    newFileNamePlaceholder: 'my-skill',
    starterTemplate: '# Skill: {name}\n\n<!-- Describe what this skill does -->\n',
  },
  {
    kind: 'folder',
    folderRelPath: '.claude/commands',
    label: 'Commands',
    description: 'Each .md file registers a slash command available in Claude sessions.',
    itemLabel: 'command',
    newFileNamePlaceholder: 'my-command',
    starterTemplate: '# Command: {name}\n\n<!-- Describe what this slash command does -->\n',
  },
  {
    kind: 'folder',
    folderRelPath: '.claude/agents',
    label: 'Agents',
    description: 'Each .md file defines a named subagent with its own prompt and toolset.',
    itemLabel: 'agent',
    newFileNamePlaceholder: 'my-agent',
    starterTemplate: '---\nname: {name}\ndescription: Use this agent when...\nmodel: claude-sonnet-4-6\ntools:\n  - Read\n  - Grep\n  - Glob\n---\n\nYou are a specialized agent for...\n',
  },
  {
    kind: 'folder',
    folderRelPath: '.claude/output-styles',
    label: 'Output Styles',
    description: "Each .md file defines a named output style that adjusts Claude's responses.",
    itemLabel: 'output style',
    newFileNamePlaceholder: 'my-style',
    starterTemplate: '# Output Style: {name}\n\n<!-- Describe the tone and format Claude should use -->\n',
  },
]
