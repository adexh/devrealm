import { Box, Btn, Heading, InfoPopover, Label, Mono, FolderIcon, AIIcon } from '../../../components/ui'
import { useWorkspaceStore } from '../../../stores/workspaceStore'
import { useNavigationStore } from '../../../stores/navigationStore'

export function AIConfigEmpty({ onSelect }: { onSelect: (id: string) => void }) {
  const { workspaces, repos } = useWorkspaceStore()
  const handleTabChange = useNavigationStore(state => state.handleTabChange)
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-6 py-3.5 border-b border-t-line flex items-center gap-3">
        <Heading size={15}>AI Configuration</Heading>
        <InfoPopover
          title="AI Configuration"
          description="AI configuration is scoped to a workspace. Pick a workspace to manage its settings, skills, plugins, MCP servers, commands, and CLAUDE.md files."
        />
      </div>

      <div className="flex-1 flex items-center justify-center p-10">
        <div className="w-130 flex flex-col gap-4 items-center text-center">
          <AIIcon size={32} />
          <Heading size={20}>Manage your AI configuration from the UI</Heading>
          <div className="text-[13px] text-t-ink-soft leading-[1.55]">
            Pick a workspace to manage its AI setup — settings, skills, plugins, MCP servers, commands, and CLAUDE.md files — all in one place.
          </div>

          {workspaces.length === 0 ? (
            <Btn className="mt-2" onClick={() => handleTabChange('Dashboard')}>
              Add a workspace to Start
            </Btn>
          ) : (
            <div className="w-full mt-2 text-left">
              <Label className="mb-1.5">Choose a workspace</Label>
              <Box className="mt-1.5 p-1 bg-t-bg" style={{ boxShadow: '0 4px 12px var(--t-hatch)' }}>
                {workspaces.slice(0, 6).map(ws => (
                  <div
                    key={ws.id}
                    onClick={() => onSelect(ws.id)}
                    className="flex items-center gap-2 px-2.5 py-2 rounded-[3px] text-[13px] cursor-pointer"
                  >
                    <FolderIcon size={12} />
                    <span className="flex-1">{ws.name}</span>
                    <Mono size={10} soft>{repos.filter(repo => repo.workspaceId === ws.id).length} repos</Mono>
                  </div>
                ))}
              </Box>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
