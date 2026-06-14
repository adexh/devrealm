export const WORKSPACE_EXPORT_VERSION = 1 as const

// A repo is considered stale if it hasn't been opened in 30 days.
export const STALE_REPO_MS = 30 * 24 * 60 * 60 * 1000
