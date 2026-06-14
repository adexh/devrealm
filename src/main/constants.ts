// Centralized constants for the main process.

// Landing page opened for auth / external navigation.
export const LANDING_URL = process.env.LANDING_URL ?? "http://localhost:3000/";

// Deep-link protocol (devrealm://auth?token=...).
export const DEEP_LINK_PROTOCOL = "devrealm";
export const AUTH_DEEP_LINK_HOST = "auth";

// Dev renderer served by Vite.
export const DEV_RENDERER_URL = "http://localhost:5173";

// Main window sizing.
export const WINDOW_DEFAULTS = {
  width: 1200,
  height: 800,
  minWidth: 900,
  minHeight: 600,
} as const;

// How often background workspace GitHub sync runs.
export const WORKSPACE_GITHUB_POLL_MS = 8 * 60 * 1000;

// Default git branch used when none is configured.
export const DEFAULT_GIT_BRANCH = "main";

// Persisted app data on disk (~/.workspace-manager/).
export const DATA_DIR_NAME = ".workspace-manager";
export const WORKSPACES_FILE_NAME = "workspaces.json";
export const CONFIG_FILE_NAME = "config.json";
export const SCHEMA_VERSION = 2;

// A repo is considered stale if it hasn't been opened in this window.
export { STALE_REPO_MS } from "../shared/constants";

// Claude configuration directory and settings files inside each workspace.
export const CLAUDE_DIR = ".claude";
export const CLAUDE_SETTINGS_FILE = "settings.json";
export const CLAUDE_SETTINGS_LOCAL_FILE = "settings.local.json";

// External GitHub endpoints.
export const GITHUB_BASE_URL = "https://github.com";
export const LATEST_RELEASE_URL =
  "https://github.com/adexh/devrealm/releases/latest";

// MCP registry.
export const MCP_REGISTRY_SERVERS_URL =
  "https://registry.modelcontextprotocol.io/v0.1/servers";
export const MCP_REGISTRY_PAGE_SIZE = 96;

// Builds the raw GitHub URL for a marketplace's manifest.
export function marketplaceManifestUrl(repo: string): string {
  return `https://raw.githubusercontent.com/${repo}/refs/heads/main/.claude-plugin/marketplace.json`;
}
