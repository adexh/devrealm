import { Box, Chip, Heading, Mono } from '../../../components/ui'
import type { RegistryMcpServer } from '../types/mcpRegistry'

export function RegistryMcpServerTile({ server }: { server: RegistryMcpServer }) {
  const displayTitle = server.title || server.name
  const isActive = server.officialStatus.toLowerCase() === 'active'

  return (
    <Box className="p-4 bg-t-panel flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <Heading size={14}>{displayTitle}</Heading>
          <Mono size={10} soft className="block mt-0.5 truncate">
            {server.name}
          </Mono>
        </div>
        {isActive && <Chip>Active</Chip>}
        {server.version && <Chip>{server.version}</Chip>}
      </div>

      <div className="text-[12px] text-t-ink-soft leading-snug min-h-12">
        {server.description || "—"}
      </div>

      <div className="flex flex-col gap-1 pt-2.5 text-[11px] text-t-ink-soft min-w-0">
        <div className="truncate">
          Website -{" "}
          {server.websiteUrl ? (
            <a
              href={server.websiteUrl}
              target="_blank"
              rel="noreferrer"
              className="text-blue-800 underline"
            >
              {server.websiteUrl}
            </a>
          ) : (
            "Not provided"
          )}
        </div>
        <div className="truncate">
          Source -{" "}
          {server.repositoryUrl ? (
            <a
              href={server.repositoryUrl}
              target="_blank"
              rel="noreferrer"
              className="text-blue-800 underline"
            >
              {server.repositoryUrl}
            </a>
          ) : (
            "Not provided"
          )}
        </div>
      </div>
    </Box>
  );
}
