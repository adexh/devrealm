import fs from "fs";
import path from "path";
import zlib from "zlib";
import simpleGit from "simple-git";
import { WORKSPACE_EXPORT_VERSION } from "../shared/constants";
import {
  CLAUDE_DIR,
  CLAUDE_SETTINGS_FILE,
  CLAUDE_SETTINGS_LOCAL_FILE,
  DEFAULT_GIT_BRANCH,
  GITHUB_BASE_URL,
} from "./constants";
import type {
  ImportedClaudeSettings,
  Repo,
  Workspace,
  WorkspaceExport,
  WorkspaceExportFile,
  WorkspaceExportRepository,
} from "../shared/types";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sanitizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeJsonValue);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, sanitizeJsonValue(entry)]),
    );
  }
  return value;
}

function isInsideDirectory(parentPath: string, childPath: string): boolean {
  const relative = path.relative(parentPath, childPath);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function readJsonObject(filePath: string): Record<string, unknown> | undefined {
  if (!fs.existsSync(filePath)) return undefined;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return isPlainObject(parsed) ? cloneJson(parsed) : undefined;
  } catch {
    return undefined;
  }
}

function getExportedSettings(workspace: Workspace): ImportedClaudeSettings | undefined {
  if (workspace.rootPath) {
    const shared = readJsonObject(path.join(workspace.rootPath, CLAUDE_DIR, CLAUDE_SETTINGS_FILE));
    return shared && Object.keys(shared).length ? { shared } : undefined;
  }

  return workspace.importedClaudeSettings?.shared
    ? { shared: workspace.importedClaudeSettings.shared }
    : undefined;
}

function normalizeGithubBranch(branch?: string): string {
  const trimmed = branch?.trim();
  return trimmed || DEFAULT_GIT_BRANCH;
}

export function normalizeGithubCloneUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  const sshMatch = trimmed.match(
    /^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/i,
  );
  if (sshMatch) return `${GITHUB_BASE_URL}/${sshMatch[1]}.git`;

  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname.toLowerCase() !== "github.com") return null;
    const parts = parsed.pathname.replace(/^\/|\/$/g, "").split("/");
    if (parts.length < 2 || !parts[0] || !parts[1]) return null;
    return `${GITHUB_BASE_URL}/${parts[0]}/${parts[1].replace(/\.git$/i, "")}.git`;
  } catch {
    return null;
  }
}

export async function getRepoCloneUrl(repo: Repo): Promise<string | null> {
  const existing = repo.cloneUrl
    ? normalizeGithubCloneUrl(repo.cloneUrl)
    : null;
  if (existing) return existing;
  if (!repo.path || !fs.existsSync(repo.path)) return null;

  try {
    const remotes = await simpleGit(repo.path).getRemotes(true);
    const origin =
      remotes.find((remote) => remote.name === "origin") ?? remotes[0];
    return normalizeGithubCloneUrl(
      origin?.refs.fetch ?? origin?.refs.push ?? "",
    );
  } catch {
    return null;
  }
}

export function workspaceExportFileName(name: string): string {
  const safe =
    name
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "workspace";
  return `${safe}.workspace.json.gz`;
}

function isMarkdownFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext === ".md" || ext === ".markdown";
}

function collectClaudeExportFiles(workspacePath?: string): WorkspaceExportFile[] {
  if (!workspacePath || !fs.existsSync(workspacePath)) return [];
  const files: WorkspaceExportFile[] = [];

  const addFile = (absolutePath: string, relativePath: string) => {
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile())
      return;
    files.push({
      relativePath: relativePath.split(path.sep).join("/"),
      content: fs.readFileSync(absolutePath, "utf8"),
    });
  };

  const rootClaudeMd = path.join(workspacePath, "CLAUDE.md");
  if (fs.existsSync(rootClaudeMd)) addFile(rootClaudeMd, "CLAUDE.md");

  const claudeDir = path.join(workspacePath, CLAUDE_DIR);
  if (!fs.existsSync(claudeDir)) return files;

  const settingsPath = path.join(claudeDir, CLAUDE_SETTINGS_FILE);
  if (fs.existsSync(settingsPath))
    addFile(settingsPath, path.join(CLAUDE_DIR, CLAUDE_SETTINGS_FILE));

  const walk = (dirPath: string) => {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(dirPath, entry.name);
      const relativePath = path.relative(workspacePath, absolutePath);
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (relativePath === path.join(CLAUDE_DIR, CLAUDE_SETTINGS_LOCAL_FILE))
        continue;
      if (relativePath === path.join(CLAUDE_DIR, CLAUDE_SETTINGS_FILE)) continue;
      if (isMarkdownFile(absolutePath)) addFile(absolutePath, relativePath);
    }
  };

  walk(claudeDir);
  return files;
}

export async function createWorkspaceExportPayload(
  workspace: Workspace,
  repos: Repo[],
): Promise<WorkspaceExport> {
  const exportRepos: WorkspaceExportRepository[] = [];
  for (const repo of repos) {
    const cloneUrl = await getRepoCloneUrl(repo);
    if (cloneUrl) exportRepos.push({ name: repo.name, cloneUrl });
  }

  return {
    version: WORKSPACE_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    workspace: {
      name: workspace.name,
      description: workspace.description,
      github: workspace.github
        ? {
            repoUrl: workspace.github.repoUrl,
            branch: normalizeGithubBranch(workspace.github.branch),
          }
        : undefined,
      aiConfig: workspace.aiConfig,
      claudeSettings: getExportedSettings(workspace),
    },
    repositories: exportRepos,
    claudeFiles: collectClaudeExportFiles(workspace.rootPath),
  };
}

export function gzipWorkspaceExport(payload: WorkspaceExport): Buffer {
  return zlib.gzipSync(JSON.stringify(payload, null, 2));
}

export function writeImportedClaudeFiles(
  workspacePath: string,
  files?: WorkspaceExportFile[],
): void {
  if (!files?.length) return;
  for (const file of files) {
    if (!file.relativePath || typeof file.content !== "string") continue;
    const normalized = file.relativePath.replace(/\\/g, "/");
    if (
      normalized === `${CLAUDE_DIR}/${CLAUDE_SETTINGS_LOCAL_FILE}` ||
      path.isAbsolute(normalized) ||
      normalized.split("/").includes("..") ||
      !(normalized === "CLAUDE.md" || normalized.startsWith(`${CLAUDE_DIR}/`))
    ) {
      continue;
    }

    const absolutePath = path.resolve(workspacePath, normalized);
    if (!isInsideDirectory(workspacePath, absolutePath)) continue;
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, file.content, "utf8");
  }
}

export function writeImportedClaudeSettings(
  workspacePath: string,
  settings?: ImportedClaudeSettings,
): void {
  if (!settings) return;
  const claudeDir = path.join(workspacePath, CLAUDE_DIR);
  const files: Array<{ fileName: string; values?: Record<string, unknown> }> = [
    { fileName: CLAUDE_SETTINGS_FILE, values: settings.shared },
    { fileName: CLAUDE_SETTINGS_LOCAL_FILE, values: settings.local },
  ];

  for (const file of files) {
    if (!file.values || Object.keys(file.values).length === 0) continue;
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, file.fileName),
      JSON.stringify(sanitizeJsonValue(file.values), null, 2),
      "utf8",
    );
  }
}

function parseWorkspaceExport(raw: unknown): WorkspaceExport {
  if (
    !isPlainObject(raw) ||
    raw.version !== WORKSPACE_EXPORT_VERSION ||
    !isPlainObject(raw.workspace)
  ) {
    throw new Error("This is not a supported workspace export file.");
  }

  const name =
    typeof raw.workspace.name === "string" ? raw.workspace.name.trim() : "";
  if (!name)
    throw new Error("The workspace export is missing a workspace name.");

  const repositoriesRaw = Array.isArray(raw.repositories)
    ? raw.repositories
    : [];
  const repositories: WorkspaceExportRepository[] = repositoriesRaw
    .map((entry) => {
      if (!isPlainObject(entry)) return null;
      const cloneUrl =
        typeof entry.cloneUrl === "string"
          ? normalizeGithubCloneUrl(entry.cloneUrl)
          : null;
      if (!cloneUrl) return null;
      const fallbackName =
        cloneUrl
          .split("/")
          .pop()
          ?.replace(/\.git$/i, "") ?? "repo";
      return {
        name:
          typeof entry.name === "string" && entry.name.trim()
            ? entry.name.trim()
            : fallbackName,
        cloneUrl,
      };
    })
    .filter(Boolean) as WorkspaceExportRepository[];

  const claudeSettingsRaw = raw.workspace.claudeSettings;
  const claudeSettings = isPlainObject(claudeSettingsRaw)
    ? {
        shared: isPlainObject(claudeSettingsRaw.shared)
          ? cloneJson(claudeSettingsRaw.shared)
          : undefined,
        local: isPlainObject(claudeSettingsRaw.local)
          ? cloneJson(claudeSettingsRaw.local)
          : undefined,
      }
    : undefined;

  const claudeFilesRaw = Array.isArray(raw.claudeFiles) ? raw.claudeFiles : [];
  const claudeFiles: WorkspaceExportFile[] = claudeFilesRaw
    .map((entry) => {
      if (!isPlainObject(entry)) return null;
      return typeof entry.relativePath === "string" &&
        typeof entry.content === "string"
        ? { relativePath: entry.relativePath, content: entry.content }
        : null;
    })
    .filter(Boolean) as WorkspaceExportFile[];

  const githubRaw = raw.workspace.github;
  const githubRepoUrl =
    isPlainObject(githubRaw) && typeof githubRaw.repoUrl === "string"
      ? normalizeGithubCloneUrl(githubRaw.repoUrl)
      : null;
  const github = githubRepoUrl
    ? {
        repoUrl: githubRepoUrl,
        branch:
          isPlainObject(githubRaw) && typeof githubRaw.branch === "string"
            ? normalizeGithubBranch(githubRaw.branch)
            : "main",
      }
    : undefined;

  return {
    version: raw.version,
    exportedAt:
      typeof raw.exportedAt === "string"
        ? raw.exportedAt
        : new Date().toISOString(),
    workspace: {
      name,
      description:
        typeof raw.workspace.description === "string"
          ? raw.workspace.description
          : undefined,
      github,
      aiConfig: isPlainObject(raw.workspace.aiConfig)
        ? (cloneJson(raw.workspace.aiConfig) as Workspace["aiConfig"])
        : undefined,
      claudeSettings,
    },
    repositories,
    claudeFiles,
  };
}

export function readWorkspaceExportFile(filePath: string): WorkspaceExport {
  if (path.extname(filePath).toLowerCase() !== ".gz") {
    throw new Error("Workspace exports must use the .gz extension.");
  }
  const raw = fs.readFileSync(filePath);
  const isGzip = raw.length >= 2 && raw[0] === 0x1f && raw[1] === 0x8b;
  if (!isGzip) throw new Error("Workspace exports must be gzipped snapshots.");
  const content = zlib.gunzipSync(raw).toString("utf8");
  return parseWorkspaceExport(JSON.parse(content));
}
