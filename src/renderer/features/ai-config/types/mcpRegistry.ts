export type RegistryMcpServer = {
  name: string
  title: string
  description: string
  version: string
  websiteUrl: string
  repositoryUrl: string
  officialStatus: string
  remotes: { type: string; url: string }[]
  packages: { registryType: string; identifier: string; label: string }[]
}

export type McpRegistryResponse = {
  servers: RegistryMcpServer[]
  nextCursor: string | null
  count: number
}
