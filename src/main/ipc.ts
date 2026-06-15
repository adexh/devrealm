import { ipcMain, shell, dialog, BrowserWindow, app } from "electron";
import { autoUpdater } from "electron-updater";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import simpleGit from "simple-git";
import * as store from "./store";
import {
  AUTH_REDIRECT_PATH,
  CLAUDE_DIR,
  CLAUDE_SETTINGS_FILE,
  CLAUDE_SETTINGS_LOCAL_FILE,
  DEV_RENDERER_URL,
  LANDING_URL,
  LATEST_RELEASE_URL,
  MCP_REGISTRY_PAGE_SIZE,
  MCP_REGISTRY_SERVERS_URL,
  marketplaceManifestUrl,
} from "./constants";
import { openInCodeEditor } from "./editorLauncher";
import {
  createWorkspaceExportPayload,
  getRepoCloneUrl,
  gzipWorkspaceExport,
  normalizeGithubCloneUrl,
  readWorkspaceExportFile,
  workspaceExportFileName,
  writeImportedClaudeFiles,
  writeImportedClaudeSettings,
} from "./workspaceTransfer";
import {
  getWorkspaceGithubChangeSummary,
  getWorkspaceGithubDiff,
  normalizeWorkspaceGithubConfig,
  pushWorkspaceGithubChanges,
  syncAllWorkspaceGithub,
  syncWorkspaceGithubById,
} from "./workspaceGithub";
import type {
  Workspace,
  Repo,
  WorkspaceGithubConfig,
  ClaudeSettingsFile,
  ClaudeSettingsSnapshot,
  ClaudeSettingsScope,
  ClaudeMdFile,
  ClaudeMdSnapshot,
  MarkdownFileContent,
  MarkdownFileIdentity,
  MarkdownFileMetadata,
  MarkdownFileWriteRequest,
  CodeEditorSettings,
  OpenInEditorRequest,
  WorkspaceFileTreeNode,
} from "../shared/types";

function getDirSize(dirPath: string): number {
  try {
    let total = 0;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".git") continue;
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += getDirSize(fullPath);
      } else {
        total += fs.statSync(fullPath).size;
      }
    }
    return total;
  } catch {
    return 0;
  }
}

const WORKSPACE_TREE_IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "release",
  ".next",
  ".vite",
  "coverage",
]);

function getWorkspaceFileTree(rootPath: string, ignoredPaths: string[] = []): WorkspaceFileTreeNode[] {
  const root = path.resolve(rootPath);
  if (!fs.existsSync(root)) return [];
  const ignoredPathSet = new Set(ignoredPaths.map((item) => path.resolve(item)));

  function readDir(dirPath: string): WorkspaceFileTreeNode[] {
    const entries = fs
      .readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => {
        if (!entry.isDirectory()) return true;
        if (WORKSPACE_TREE_IGNORED_DIRS.has(entry.name)) return false;
        return !ignoredPathSet.has(path.resolve(dirPath, entry.name));
      })
      .sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    return entries.map((entry) => {
      const absolutePath = path.join(dirPath, entry.name);
      const relativePath = path.relative(root, absolutePath).split(path.sep).join("/");
      const node: WorkspaceFileTreeNode = {
        id: relativePath,
        name: entry.name,
        relativePath,
        absolutePath,
        type: entry.isDirectory() ? "directory" : "file",
      };
      if (entry.isDirectory()) node.children = readDir(absolutePath);
      return node;
    });
  }

  return readDir(root);
}

function resolveRepoOpenTarget({
  targetPath,
  repoId,
  workspaceId,
}: OpenInEditorRequest): { targetPath: string; repo: Repo | null } {
  const repos = store.getRepos();
  const repo =
    (repoId ? repos.find((item) => item.id === repoId) : undefined) ??
    repos.find((item) => item.path === targetPath) ??
    null;
  const requestedPath = (repo?.path || targetPath || "").trim();

  if (!requestedPath) {
    throw new Error("Repository has not been cloned yet.");
  }

  if (path.isAbsolute(requestedPath)) {
    return { targetPath: path.normalize(requestedPath), repo };
  }

  const workspaces = store.getWorkspaces();
  const workspace =
    (workspaceId ? workspaces.find((item) => item.id === workspaceId) : undefined) ??
    (repo ? workspaces.find((item) => item.id === repo.workspaceId) : undefined);

  if (!workspace?.rootPath) {
    throw new Error(
      `Repository path "${requestedPath}" is relative and no workspace root was found.`,
    );
  }

  return {
    targetPath: path.resolve(workspace.rootPath, requestedPath),
    repo,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getMarketplaceManifestUrl(source: {
  source: string;
  repo: string;
}): string {
  if (source.source !== "github" || !source.repo) {
    throw new Error("Only GitHub-backed marketplaces are supported.");
  }
  return marketplaceManifestUrl(source.repo);
}

function textField(value: unknown): string {
  return typeof value === "string" ? value : "";
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

function normalizeGitignorePattern(value: string): string {
  return value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

async function readFolderGithubConfig(
  folderPath: string,
): Promise<WorkspaceGithubConfig | undefined> {
  try {
    const git = simpleGit(folderPath);
    const remotes = await git.getRemotes(true);
    const origin =
      remotes.find((remote) => remote.name === "origin") ?? remotes[0];
    const repoUrl = origin?.refs.fetch ?? origin?.refs.push;
    if (!repoUrl) return undefined;

    const branch = (await git.branch()).current || undefined;
    return normalizeWorkspaceGithubConfig({ repoUrl, branch });
  } catch {
    return undefined;
  }
}

function getRepoIgnorePattern(workspace: Workspace, repoPath: string): string | null {
  const github = normalizeWorkspaceGithubConfig(workspace.github);
  if (!github || !workspace.rootPath || !repoPath) return null;

  const workspacePath = path.resolve(workspace.rootPath);
  const absoluteRepoPath = path.resolve(repoPath);
  if (absoluteRepoPath === workspacePath) return null;
  if (!isInsideDirectory(workspacePath, absoluteRepoPath)) return null;

  const relativePath = path
    .relative(workspacePath, absoluteRepoPath)
    .split(path.sep)
    .join("/");
  if (!relativePath || relativePath.startsWith("..")) return null;

  return `/${normalizeGitignorePattern(relativePath)}/`;
}

function ensureWorkspaceReposIgnored(workspace: Workspace, repos: Repo[]): void {
  const patterns = repos
    .map((repo) => getRepoIgnorePattern(workspace, repo.path))
    .filter(Boolean) as string[];
  if (!patterns.length || !workspace.rootPath) return;

  const gitignorePath = path.join(workspace.rootPath, ".gitignore");
  const existingContent = fs.existsSync(gitignorePath)
    ? fs.readFileSync(gitignorePath, "utf8")
    : "";
  const existingPatterns = new Set(
    existingContent
      .split(/\r?\n/)
      .map(normalizeGitignorePattern)
      .filter(Boolean),
  );
  const missingPatterns = patterns.filter(
    (pattern) => !existingPatterns.has(normalizeGitignorePattern(pattern)),
  );
  if (!missingPatterns.length) return;

  const prefix = existingContent && !existingContent.endsWith("\n") ? "\n" : "";
  const content = `${prefix}${missingPatterns.join("\n")}\n`;
  fs.appendFileSync(gitignorePath, content, "utf8");
}

function ensureWorkspaceRepoIgnored(workspaceId: string, repo: Repo): void {
  const workspace = store.getWorkspaces().find((item) => item.id === workspaceId);
  if (!workspace) return;
  ensureWorkspaceReposIgnored(workspace, [repo]);
}

function readClaudeSettingsFile(filePath: string): ClaudeSettingsFile {
  const exists = fs.existsSync(filePath);
  if (!exists)
    return { path: filePath, exists: false, values: {}, error: null };

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed)) {
      return {
        path: filePath,
        exists: true,
        values: {},
        error: "Settings file must contain a JSON object at the top level.",
      };
    }
    return {
      path: filePath,
      exists: true,
      values: cloneJson(parsed),
      error: null,
    };
  } catch (error) {
    return {
      path: filePath,
      exists: true,
      values: {},
      error:
        error instanceof Error
          ? error.message
          : "Unable to parse settings file.",
    };
  }
}

function getClaudeSettingsSnapshot(
  workspacePath?: string,
): ClaudeSettingsSnapshot {
  const basePath = workspacePath
    ? path.join(workspacePath, CLAUDE_DIR)
    : path.join(CLAUDE_DIR);
  return {
    shared: readClaudeSettingsFile(path.join(basePath, CLAUDE_SETTINGS_FILE)),
    local: readClaudeSettingsFile(path.join(basePath, CLAUDE_SETTINGS_LOCAL_FILE)),
  };
}

function assertMarkdownExtension(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== ".md" && ext !== ".markdown") {
    throw new Error("Markdown files must use a .md or .markdown extension.");
  }
}

function isMarkdownFileName(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  return ext === ".md" || ext === ".markdown";
}

function isInsideDirectory(parentPath: string, childPath: string): boolean {
  const relative = path.relative(parentPath, childPath);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function resolveMarkdownFilePath(
  identity: MarkdownFileIdentity,
  options: { requireMarkdown?: boolean } = {},
): {
  absolutePath: string;
  workspacePath?: string;
  relativePath?: string;
} {
  if ("workspacePath" in identity && identity.workspacePath) {
    const workspacePath = path.resolve(identity.workspacePath);
    const relativePath = identity.relativePath;
    if (!relativePath || path.isAbsolute(relativePath)) {
      throw new Error(
        "Markdown relativePath must be relative to the workspace.",
      );
    }

    const absolutePath = path.resolve(workspacePath, relativePath);
    if (!isInsideDirectory(workspacePath, absolutePath)) {
      throw new Error("Markdown relativePath must stay inside the workspace.");
    }

    if (options.requireMarkdown) assertMarkdownExtension(absolutePath);
    return { absolutePath, workspacePath, relativePath };
  }

  if ("absolutePath" in identity && identity.absolutePath) {
    if (!path.isAbsolute(identity.absolutePath)) {
      throw new Error("Markdown absolutePath must be absolute.");
    }

    const absolutePath = path.resolve(identity.absolutePath);
    if (options.requireMarkdown) assertMarkdownExtension(absolutePath);
    return { absolutePath };
  }

  throw new Error("A Markdown file path is required.");
}

function getMarkdownFileMetadata(
  identity: MarkdownFileIdentity,
): MarkdownFileMetadata {
  return getResolvedMarkdownFileMetadata(resolveMarkdownFilePath(identity));
}

function getResolvedMarkdownFileMetadata(resolved: {
  absolutePath: string;
  workspacePath?: string;
  relativePath?: string;
}): MarkdownFileMetadata {
  const exists = fs.existsSync(resolved.absolutePath);
  const stat = exists ? fs.statSync(resolved.absolutePath) : null;

  return {
    ...resolved,
    exists,
    createdAt: stat?.birthtimeMs,
    updatedAt: stat?.mtimeMs,
  };
}

let activeCloneProc: ReturnType<typeof spawn> | null = null;

export function registerIpcHandlers() {
  ipcMain.on("workspaces:initial-data", (event) => {
    event.returnValue = store.getDataSnapshot();
  });

  ipcMain.handle("settings:set-dark-mode", (_, dark: boolean) => {
    const config = store.readConfig();
    config.darkMode = dark;
    store.writeConfig(config);
  });

  ipcMain.handle("settings:get-editor-settings", () => {
    return store.getEditorSettings();
  });

  ipcMain.handle(
    "settings:save-editor-settings",
    (_, settings: CodeEditorSettings) => {
      return store.saveEditorSettings(settings);
    },
  );

  ipcMain.handle("workspaces:list", () => store.getWorkspaces());
  ipcMain.handle("workspaces:snapshot", () => store.getDataSnapshot());
  ipcMain.handle("repos:list", () => store.getRepos());
  ipcMain.handle("workspaces:list-files", (_, rootPath: string) => {
    if (!rootPath) return [];
    const workspace = store
      .getWorkspaces()
      .find((item) => item.rootPath && path.resolve(item.rootPath) === path.resolve(rootPath));
    const repoPaths = workspace
      ? store
          .getRepos()
          .filter((repo) => repo.workspaceId === workspace.id && repo.path)
          .map((repo) => repo.path)
      : [];
    return getWorkspaceFileTree(rootPath, repoPaths);
  });
  ipcMain.handle("workspaces:sync-github", async (_, workspaceId?: string) => {
    if (workspaceId) return syncWorkspaceGithubById(workspaceId);
    return syncAllWorkspaceGithub();
  });
  ipcMain.handle("workspaces:github-status", async (_, workspaceId: string) => {
    const workspace = store.getWorkspaces().find((item) => item.id === workspaceId);
    if (workspace) {
      ensureWorkspaceReposIgnored(
        workspace,
        store.getRepos().filter((repo) => repo.workspaceId === workspace.id),
      );
    }
    return getWorkspaceGithubChangeSummary(workspaceId);
  });
  ipcMain.handle("workspaces:github-diff", async (_, workspaceId: string) => {
    const workspace = store.getWorkspaces().find((item) => item.id === workspaceId);
    if (workspace) {
      ensureWorkspaceReposIgnored(
        workspace,
        store.getRepos().filter((repo) => repo.workspaceId === workspace.id),
      );
    }
    return getWorkspaceGithubDiff(workspaceId);
  });
  ipcMain.handle(
    "workspaces:github-push",
    async (_, { workspaceId, message }: { workspaceId: string; message: string }) => {
      const workspace = store.getWorkspaces().find((item) => item.id === workspaceId);
      if (workspace) {
        ensureWorkspaceReposIgnored(
          workspace,
          store.getRepos().filter((repo) => repo.workspaceId === workspace.id),
        );
      }
      return pushWorkspaceGithubChanges(workspaceId, message);
    },
  );
  ipcMain.handle("workspaces:clone-github", async (event, workspaceId: string) => {
    const workspace = store.getWorkspaces().find((item) => item.id === workspaceId);
    if (!workspace) throw new Error("Workspace not found.");

    const github = normalizeWorkspaceGithubConfig(workspace.github);
    if (!github) throw new Error("No GitHub repo configured for this workspace.");
    if (!workspace.rootPath) throw new Error("Workspace path is missing.");
    const workspacePath = workspace.rootPath;

    await new Promise<void>((resolve, reject) => {
      const proc = spawn("git", [
        "clone",
        "--progress",
        "--branch",
        github.branch,
        github.repoUrl,
        workspacePath,
      ]);
      activeCloneProc = proc;
      const send = (data: Buffer) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send("repos:clone:progress", data.toString());
        }
      };
      proc.stdout.on("data", send);
      proc.stderr.on("data", send);
      proc.on("close", (code: number | null) => {
        activeCloneProc = null;
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`git clone failed (exit ${code})`));
        }
      });
      proc.on("error", (err: Error) => { activeCloneProc = null; reject(err); });
    });

    return store.getWorkspaces().find((item) => item.id === workspaceId) ?? workspace;
  });

  ipcMain.handle(
    "workspaces:create",
    (
      _,
      {
        name,
        description,
        rootPath,
        github,
      }: {
        name: string;
        description?: string;
        rootPath?: string;
        github?: Partial<WorkspaceGithubConfig>;
      },
    ) => {
      const wsPath = rootPath ? path.join(rootPath, name) : undefined;
      if (wsPath) fs.mkdirSync(wsPath, { recursive: true });
      const normalizedGithub = normalizeWorkspaceGithubConfig(github);
      const workspace: Workspace = {
        id: randomUUID(),
        name,
        description,
        rootPath: wsPath,
        github: normalizedGithub,
        createdAt: Date.now(),
      };
      store.saveWorkspace(workspace);
      return workspace;
    },
  );

  ipcMain.handle("workspaces:browse-dir", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    });
    return result.filePaths[0] ?? null;
  });

  ipcMain.handle("workspaces:browse-import-file", async () => {
    const result = await dialog.showOpenDialog({
      title: "Select workspace export",
      properties: ["openFile"],
      filters: [{ name: "Workspace export", extensions: ["gz"] }],
    });
    return result.filePaths[0] ?? null;
  });

  ipcMain.handle(
    "workspaces:open-from-dir",
    async (
      _,
      {
        dirPath,
        github,
      }: { dirPath: string; github?: Partial<WorkspaceGithubConfig> },
    ) => {
      const wsName = path.basename(dirPath);
      const isGitFolder = fs.existsSync(path.join(dirPath, ".git"));

      // If the imported folder is itself a git repo, treat it as the
      // workspace's GitHub repo (same as the "add GitHub repo" option when
      // creating a workspace). Any explicitly-passed github config wins.
      let normalizedGithub = normalizeWorkspaceGithubConfig(github);
      if (!normalizedGithub && isGitFolder) {
        normalizedGithub = await readFolderGithubConfig(dirPath);
      }

      const workspace: Workspace = {
        id: randomUUID(),
        name: wsName,
        rootPath: dirPath,
        github: normalizedGithub,
        createdAt: Date.now(),
      };

      // When the folder isn't a repo itself, scan one level deep for git
      // repos and add them as workspace repos.
      const addedRepos: Repo[] = [];
      if (!isGitFolder) {
        try {
          const entries = fs.readdirSync(dirPath, { withFileTypes: true });
          for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const repoPath = path.join(dirPath, entry.name);
            if (!fs.existsSync(path.join(repoPath, ".git"))) continue;
            const repo: Repo = {
              id: randomUUID(),
              workspaceId: workspace.id,
              name: entry.name,
              path: repoPath,
              lastOpenedAt: Date.now(),
              size: getDirSize(repoPath),
            };
            repo.cloneUrl = (await getRepoCloneUrl(repo)) ?? undefined;
            addedRepos.push(repo);
          }
        } catch {
          // permission error or invalid path — create empty workspace
        }
      }

      store.saveWorkspace(workspace);
      addedRepos.forEach((repo) => store.saveRepo(repo));
      ensureWorkspaceReposIgnored(workspace, addedRepos);
      return { workspace, repos: addedRepos };
    },
  );

  ipcMain.handle("workspaces:delete", (_, id: string) => {
    store.deleteWorkspace(id);
  });

  ipcMain.handle("workspaces:update", (_, workspace: Workspace) => {
    const nextWorkspace: Workspace = {
      ...workspace,
      github: normalizeWorkspaceGithubConfig(workspace.github),
    };
    store.saveWorkspace(nextWorkspace);
    ensureWorkspaceReposIgnored(
      nextWorkspace,
      store.getRepos().filter((repo) => repo.workspaceId === nextWorkspace.id),
    );
    return nextWorkspace;
  });

  ipcMain.handle("workspaces:export", async (_, id: string) => {
    const workspace = store.getWorkspaces().find((w) => w.id === id);
    if (!workspace) throw new Error("Workspace not found.");

    const repos = store
      .getRepos()
      .filter((repo) => repo.workspaceId === workspace.id);
    const payload = await createWorkspaceExportPayload(workspace, repos);

    const result = await dialog.showSaveDialog({
      title: "Export workspace",
      defaultPath: workspaceExportFileName(workspace.name),
      filters: [{ name: "Workspace export", extensions: ["gz"] }],
    });
    if (result.canceled || !result.filePath) return null;

    fs.writeFileSync(result.filePath, gzipWorkspaceExport(payload));
    return result.filePath;
  });

  ipcMain.handle(
    "workspaces:import",
    async (_, { rootPath, filePath }: { rootPath: string; filePath: string }) => {
      if (!rootPath) throw new Error("A destination directory is required.");
      if (!filePath) throw new Error("A workspace export file is required.");

      const parsed = readWorkspaceExportFile(filePath);
      const createdAt = Date.now();
      const workspacePath = path.join(rootPath, parsed.workspace.name);
      fs.mkdirSync(workspacePath, { recursive: true });
      writeImportedClaudeFiles(workspacePath, parsed.claudeFiles);
      writeImportedClaudeSettings(
        workspacePath,
        parsed.workspace.claudeSettings,
      );

      const workspace: Workspace = {
        id: randomUUID(),
        name: parsed.workspace.name,
        description: parsed.workspace.description,
        rootPath: workspacePath,
        createdAt,
        aiConfig: parsed.workspace.aiConfig,
        github: parsed.workspace.github,
        importedClaudeSettings: parsed.workspace.claudeSettings,
      };

      const repos: Repo[] = parsed.repositories.map((repo) => {
        const importedRepo: Repo = {
          id: randomUUID(),
          workspaceId: workspace.id,
          name: repo.name,
          path: "",
          cloneUrl: repo.cloneUrl,
          lastOpenedAt: createdAt,
          size: 0,
        };
        return importedRepo;
      });

      store.saveWorkspace(workspace);
      repos.forEach(repo => store.saveRepo(repo));
      return { workspace, repos };
    },
  );

  ipcMain.handle(
    "repos:add",
    async (
      _,
      { repoPath, workspaceId }: { repoPath: string; workspaceId: string },
    ) => {
      const name = path.basename(repoPath);
      const size = getDirSize(repoPath);
      const repo: Repo = {
        id: randomUUID(),
        workspaceId,
        name,
        path: repoPath,
        lastOpenedAt: Date.now(),
        size,
      };
      repo.cloneUrl = (await getRepoCloneUrl(repo)) ?? undefined;
      store.saveRepo(repo);
      ensureWorkspaceRepoIgnored(workspaceId, repo);
      return repo;
    },
  );

  ipcMain.handle("repos:browse", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    });
    return result.filePaths[0] ?? null;
  });

  ipcMain.handle(
    "repos:clone",
    async (
      event,
      {
        url,
        destDir,
        workspaceId,
        repoId,
      }: { url: string; destDir: string; workspaceId: string; repoId?: string },
    ) => {
      const repoName = url.split("/").pop()?.replace(".git", "") ?? "repo";
      const repoPath = path.join(destDir, repoName);
      await new Promise<void>((resolve, reject) => {
        const proc = spawn("git", ["clone", "--progress", url, repoPath]);
        activeCloneProc = proc;
        const send = (data: Buffer) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send("repos:clone:progress", data.toString());
          }
        };
        proc.stdout.on("data", send);
        proc.stderr.on("data", send);
        proc.on("close", (code) => {
          activeCloneProc = null;
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`git clone failed (exit ${code})`));
          }
        });
        proc.on("error", (err) => { activeCloneProc = null; reject(err); });
      });
      const size = getDirSize(repoPath);
      const existingRepo = repoId
        ? store.getRepos().find((repo) => repo.id === repoId)
        : null;
      const repo: Repo = {
        id: existingRepo?.id ?? randomUUID(),
        workspaceId,
        name: existingRepo?.name || repoName,
        path: repoPath,
        cloneUrl: normalizeGithubCloneUrl(url) ?? url,
        lastOpenedAt: Date.now(),
        size,
        aiConfigOverride: existingRepo?.aiConfigOverride,
      };
      store.saveRepo(repo);
      ensureWorkspaceRepoIgnored(workspaceId, repo);
      return repo;
    },
  );

  ipcMain.handle("repos:path-exists", (_, folderPath: string) => {
    return fs.existsSync(folderPath);
  });

  ipcMain.handle(
    "repos:scan-workspace",
    (_, { workspacePath, existingRepoPaths }: { workspacePath: string; existingRepoPaths: string[] }) => {
      const existingSet = new Set(existingRepoPaths.map(p => path.normalize(p)));
      const found: { name: string; path: string }[] = [];
      try {
        const entries = fs.readdirSync(workspacePath, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const repoPath = path.join(workspacePath, entry.name);
          if (existingSet.has(path.normalize(repoPath))) continue;
          const gitDir = path.join(repoPath, ".git");
          if (fs.existsSync(gitDir)) {
            found.push({ name: entry.name, path: repoPath });
          }
        }
        const workspace = store
          .getWorkspaces()
          .find((item) => item.rootPath && path.resolve(item.rootPath) === path.resolve(workspacePath));
        if (workspace) {
          ensureWorkspaceReposIgnored(
            workspace,
            found.map((repo) => ({
              id: "",
              workspaceId: workspace.id,
              name: repo.name,
              path: repo.path,
              lastOpenedAt: Date.now(),
              size: 0,
            })),
          );
        }
      } catch {
        // permission error or invalid path
      }
      return found;
    },
  );

  ipcMain.handle("repos:delete-folder", (_, folderPath: string) => {
    fs.rmSync(folderPath, { recursive: true, force: true });
  });

  ipcMain.handle("repos:clone:stop", () => {
    if (activeCloneProc) {
      activeCloneProc.kill();
      activeCloneProc = null;
    }
  });

  ipcMain.handle(
    "repos:remove-from-workspace",
    (_, { repoId, workspaceId }: { repoId: string; workspaceId: string }) => {
      store.removeRepoFromWorkspace(workspaceId, repoId);
    },
  );

  ipcMain.handle("repos:delete", (_, id: string) => {
    store.deleteRepo(id);
  });

  ipcMain.handle(
    "repos:open-editor",
    async (_, request: OpenInEditorRequest) => {
      const { targetPath, repo } = resolveRepoOpenTarget(request);
      await openInCodeEditor(targetPath, request.editorId);
      if (repo) {
        repo.lastOpenedAt = Date.now();
        store.saveRepo(repo);
      }
    },
  );

  ipcMain.handle("repos:open-vscode", async (_, repoPath: string) => {
    await openInCodeEditor(repoPath, "vscode");
    const repos = store.getRepos();
    const repo = repos.find((r) => r.path === repoPath);
    if (repo) {
      repo.lastOpenedAt = Date.now();
      store.saveRepo(repo);
    }
  });

  ipcMain.handle("repos:open-terminal", (_, repoPath: string) => {
    shell.openPath(repoPath);
  });

  ipcMain.handle("repos:pull", async (_, repoPath: string) => {
    await simpleGit(repoPath).pull();
  });

  ipcMain.handle("repos:update", (_, repo: Repo) => {
    store.saveRepo(repo);
    ensureWorkspaceRepoIgnored(repo.workspaceId, repo);
    return repo;
  });

  ipcMain.handle(
    "repos:check-ai-coverage",
    async (_, repos: { id: string; path: string }[]) => {
      const result: Record<string, boolean> = {};
      const localRepos = repos.filter((r) => r.path);
      if (!localRepos.length) return result;

      const entries = await Promise.all(
        localRepos.map(async ({ id, path: repoPath }) => {
          const hasClaudeMd = await fs.promises
            .access(path.join(repoPath, "CLAUDE.md"), fs.constants.F_OK)
            .then(() => true)
            .catch(() => false);
          if (hasClaudeMd) return [id, true] as const;

          const hasClaudeDir = await fs.promises
            .stat(path.join(repoPath, CLAUDE_DIR))
            .then((stat) => stat.isDirectory())
            .catch(() => false);
          return [id, hasClaudeDir] as const;
        }),
      );
      for (const [id, hasCoverage] of entries) {
        result[id] = hasCoverage;
      }
      return result;
    },
  );

  ipcMain.handle("browse:dest-dir", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    });
    return result.filePaths[0] ?? null;
  });

  ipcMain.handle(
    "markdown:read-file",
    (_, identity: MarkdownFileIdentity): MarkdownFileContent => {
      const metadata = getMarkdownFileMetadata(identity);
      if (!metadata.exists) {
        throw new Error("Markdown file does not exist.");
      }

      return {
        ...metadata,
        content: fs.readFileSync(metadata.absolutePath, "utf8"),
      };
    },
  );

  ipcMain.handle(
    "markdown:write-file",
    (_, request: MarkdownFileWriteRequest): MarkdownFileMetadata => {
      const { content, ...identity } = request;
      const resolved = resolveMarkdownFilePath(identity);
      fs.mkdirSync(path.dirname(resolved.absolutePath), { recursive: true });
      fs.writeFileSync(resolved.absolutePath, content, "utf8");
      return getResolvedMarkdownFileMetadata(resolved);
    },
  );

  ipcMain.handle(
    "markdown:create-file",
    (_, request: MarkdownFileWriteRequest): MarkdownFileMetadata => {
      const { content, ...identity } = request;
      const resolved = resolveMarkdownFilePath(identity, { requireMarkdown: true });
      if (fs.existsSync(resolved.absolutePath)) {
        throw new Error("Markdown file already exists.");
      }

      fs.mkdirSync(path.dirname(resolved.absolutePath), { recursive: true });
      fs.writeFileSync(resolved.absolutePath, content, "utf8");
      return getResolvedMarkdownFileMetadata(resolved);
    },
  );

  ipcMain.handle("claude:read-settings", (_, workspacePath?: string) => {
    return getClaudeSettingsSnapshot(workspacePath);
  });

  ipcMain.handle(
    "claude:write-settings",
    (
      _,
      {
        workspacePath,
        scope,
        values,
      }: {
        workspacePath: string;
        scope: ClaudeSettingsScope;
        values: Record<string, unknown>;
      },
    ) => {
      if (!workspacePath)
        throw new Error("Workspace path is required to save Claude settings.");
      if (!isPlainObject(values))
        throw new Error("Claude settings must be saved as a JSON object.");

      const claudeDir = path.join(workspacePath, CLAUDE_DIR);
      fs.mkdirSync(claudeDir, { recursive: true });

      const fileName =
        scope === "local" ? CLAUDE_SETTINGS_LOCAL_FILE : CLAUDE_SETTINGS_FILE;
      const filePath = path.join(claudeDir, fileName);
      const nextValues = sanitizeJsonValue(values);
      if (!isPlainObject(nextValues))
        throw new Error("Claude settings must be saved as a JSON object.");

      fs.writeFileSync(
        filePath,
        `${JSON.stringify(nextValues, null, 2)}\n`,
        "utf8",
      );
      return getClaudeSettingsSnapshot(workspacePath);
    },
  );

  ipcMain.handle("claude:plugins-and-skills", (_, workspacePath?: string) => {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
    const globalPluginsDir = path.join(home, CLAUDE_DIR, "plugins");
    const globalInstalledPath = path.join(
      globalPluginsDir,
      "installed_plugins.json",
    );

    type PluginEntry = {
      id: string;
      name: string;
      version: string;
      description: string;
      enabled: boolean;
      skills: { name: string; description: string }[];
    };

    function readGlobalInstalled(): Record<
      string,
      { installPath: string; version: string }[]
    > {
      try {
        return (
          JSON.parse(fs.readFileSync(globalInstalledPath, "utf8")).plugins ?? {}
        );
      } catch {
        return {};
      }
    }

    function resolvePlugin(
      pluginId: string,
      globalInstalled: Record<
        string,
        { installPath: string; version: string }[]
      >,
    ): PluginEntry | null {
      const installs = globalInstalled[pluginId];
      const install = installs?.[0];
      if (!install) return null;

      let description = "";
      try {
        description =
          JSON.parse(
            fs.readFileSync(
              path.join(install.installPath, "plugin.json"),
              "utf8",
            ),
          ).description ?? "";
      } catch {
        /* ok */
      }

      const skillsDir = path.join(install.installPath, "skills");
      const skills: { name: string; description: string }[] = [];
      try {
        for (const entry of fs.readdirSync(skillsDir)) {
          if (!fs.statSync(path.join(skillsDir, entry)).isDirectory()) continue;
          let skillDesc = "";
          try {
            const skillMd = fs.readFileSync(
              path.join(skillsDir, entry, "skill.md"),
              "utf8",
            );
            const m = skillMd.match(/^description:\s*(.+)$/m);
            if (m) skillDesc = m[1].trim();
          } catch {
            /* ok */
          }
          skills.push({ name: entry, description: skillDesc });
        }
      } catch {
        /* no skills dir */
      }

      return {
        id: pluginId,
        name: pluginId.split("@")[0],
        version: install.version,
        description,
        enabled: true,
        skills,
      };
    }

    try {
      const globalInstalled = readGlobalInstalled();

      // Collect all plugins listed in enabledPlugins (both true and false)
      const pluginEnabledMap = new Map<string, boolean>();
      if (workspacePath) {
        const claudeDir = path.join(workspacePath, CLAUDE_DIR);
        for (const fname of [CLAUDE_SETTINGS_FILE, CLAUDE_SETTINGS_LOCAL_FILE]) {
          try {
            const cfg = JSON.parse(
              fs.readFileSync(path.join(claudeDir, fname), "utf8"),
            );
            if (cfg.enabledPlugins && typeof cfg.enabledPlugins === "object") {
              for (const [k, v] of Object.entries(
                cfg.enabledPlugins as Record<string, boolean>,
              )) {
                pluginEnabledMap.set(k, v);
              }
            }
          } catch {
            /* ok */
          }
        }
      }

      const plugins: PluginEntry[] = [];
      for (const [id, enabled] of pluginEnabledMap) {
        const p = resolvePlugin(id, globalInstalled);
        if (p) {
          plugins.push({ ...p, enabled });
        } else {
          // Plugin is configured but not installed — show as unresolved so it can be removed
          plugins.push({
            id,
            name: id.split("@")[0],
            version: "",
            description: "Not installed",
            enabled,
            skills: [],
          });
        }
      }
      return plugins;
    } catch {
      return [];
    }
  });

  ipcMain.handle(
    "claude:set-plugin-enabled",
    (
      _,
      {
        workspacePath,
        pluginId,
        enabled,
      }: { workspacePath: string; pluginId: string; enabled: boolean },
    ) => {
      const settingsPath = path.join(workspacePath, CLAUDE_DIR, CLAUDE_SETTINGS_FILE);
      let settings: Record<string, unknown> = {};
      try {
        settings = cloneJson(JSON.parse(fs.readFileSync(settingsPath, "utf8")));
      } catch {
        /* ok */
      }
      if (!isPlainObject(settings)) settings = {};
      const existing = isPlainObject(settings.enabledPlugins)
        ? { ...(settings.enabledPlugins as Record<string, boolean>) }
        : {};
      existing[pluginId] = enabled;
      settings.enabledPlugins = existing;
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      fs.writeFileSync(
        settingsPath,
        `${JSON.stringify(settings, null, 2)}\n`,
        "utf8",
      );
    },
  );

  ipcMain.handle(
    "claude:remove-plugin",
    (
      _,
      { workspacePath, pluginId }: { workspacePath: string; pluginId: string },
    ) => {
      const settingsPath = path.join(workspacePath, CLAUDE_DIR, CLAUDE_SETTINGS_FILE);
      let settings: Record<string, unknown> = {};
      try {
        settings = cloneJson(JSON.parse(fs.readFileSync(settingsPath, "utf8")));
      } catch {
        /* ok */
      }
      if (!isPlainObject(settings)) settings = {};
      if (isPlainObject(settings.enabledPlugins)) {
        const existing = {
          ...(settings.enabledPlugins as Record<string, boolean>),
        };
        delete existing[pluginId];
        settings.enabledPlugins = existing;
      }
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      fs.writeFileSync(
        settingsPath,
        `${JSON.stringify(settings, null, 2)}\n`,
        "utf8",
      );
    },
  );

  ipcMain.handle(
    "claude:read-md-files",
    (_, workspacePath: string): ClaudeMdSnapshot => {
      const rootFiles: ClaudeMdFile[] = ["CLAUDE.md", "CLAUDE.local.md"].map(
        (rel) => {
          const absolutePath = path.join(workspacePath, rel);
          return {
            name: rel,
            relativePath: rel,
            absolutePath,
            exists: fs.existsSync(absolutePath),
          };
        },
      );
      const folderRelPaths = [
        ".claude/rules",
        ".claude/skills",
        ".claude/commands",
        ".claude/agents",
        ".claude/output-styles",
      ];
      const folders = folderRelPaths.map((folderRelPath) => {
        const folderAbs = path.join(workspacePath, folderRelPath);
        const files: ClaudeMdFile[] = [];
        if (fs.existsSync(folderAbs) && fs.statSync(folderAbs).isDirectory()) {
          for (const entry of fs.readdirSync(folderAbs, {
            withFileTypes: true,
          })) {
            if (entry.isFile() && isMarkdownFileName(entry.name)) {
              const absolutePath = path.join(folderAbs, entry.name);
              files.push({
                name: entry.name,
                relativePath: `${folderRelPath}/${entry.name}`,
                absolutePath,
                exists: true,
              });
              continue;
            }

            if (folderRelPath === ".claude/skills" && entry.isDirectory()) {
              const absolutePath = path.join(folderAbs, entry.name, "SKILL.md");
              if (!fs.existsSync(absolutePath)) continue;
              files.push({
                name: `${entry.name}/SKILL.md`,
                relativePath: `${folderRelPath}/${entry.name}/SKILL.md`,
                absolutePath,
                exists: true,
              });
            }
          }
        }
        return { folderRelPath, files };
      });
      return { rootFiles, folders };
    },
  );

  ipcMain.handle(
    "claude:create-md-file",
    (
      _,
      {
        workspacePath,
        relativePath,
        content,
      }: {
        workspacePath: string;
        relativePath: string;
        content: string;
      },
    ): string => {
      const absolutePath = path.join(workspacePath, relativePath);
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      if (!fs.existsSync(absolutePath))
        fs.writeFileSync(absolutePath, content, "utf8");
      return absolutePath;
    },
  );

  ipcMain.handle("claude:list-marketplaces", () => {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
    try {
      const pluginsDir = path.join(home, CLAUDE_DIR, "plugins");
      const knownPathCandidates = [
        path.join(pluginsDir, "known_marketplaces.json"),
        path.join(pluginsDir, "known-marketplaces.json"),
      ];
      const knownPath =
        knownPathCandidates.find((candidate) => fs.existsSync(candidate)) ??
        knownPathCandidates[0];
      const raw = JSON.parse(fs.readFileSync(knownPath, "utf8")) as Record<
        string,
        {
          source: { source: string; repo: string };
          installLocation: string;
          lastUpdated: string;
        }
      >;
      return Object.entries(raw).map(([id, data]) => {
        let pluginCount = 0;
        try {
          const loc = data.installLocation;
          for (const name of [
            "plugins.json",
            "index.json",
            "marketplace.json",
          ]) {
            const p = path.join(loc, name);
            if (fs.existsSync(p)) {
              const parsed = JSON.parse(fs.readFileSync(p, "utf8"));
              pluginCount = Array.isArray(parsed)
                ? parsed.length
                : Object.keys(parsed as object).length;
              break;
            }
          }
        } catch {
          /* ok */
        }
        return {
          id,
          source: data.source,
          installLocation: data.installLocation,
          lastUpdated: data.lastUpdated,
          pluginCount,
        };
      });
    } catch {
      return [];
    }
  });

  ipcMain.handle(
    "claude:fetch-marketplace-plugins",
    async (
      _,
      source: { source: string; repo: string },
    ): Promise<
      {
        name: string;
        description: string;
        category: string;
        homepage: string;
        sourceLabel: string;
      }[]
    > => {
      const manifestUrl = getMarketplaceManifestUrl(source);
      const response = await fetch(manifestUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch marketplace plugins (${response.status}).`,
        );
      }

      const parsed = (await response.json()) as {
        plugins?: Array<Record<string, unknown>>;
      };
      const plugins = Array.isArray(parsed.plugins) ? parsed.plugins : [];

      return plugins.map((plugin) => {
        const rawSource = plugin.source;
        const sourceLabel = (() => {
          if (typeof rawSource === "string") return rawSource;
          if (isPlainObject(rawSource)) {
            if (typeof rawSource.url === "string") return rawSource.url;
            if (typeof rawSource.path === "string") return rawSource.path;
            if (typeof rawSource.source === "string") return rawSource.source;
          }
          return "—";
        })();

        return {
          name:
            typeof plugin.name === "string" && plugin.name
              ? plugin.name
              : "Unnamed plugin",
          description:
            typeof plugin.description === "string" ? plugin.description : "",
          category:
            typeof plugin.category === "string" ? plugin.category : "other",
          homepage: typeof plugin.homepage === "string" ? plugin.homepage : "",
          sourceLabel,
        };
      });
    },
  );

  ipcMain.handle(
    "claude:fetch-mcp-registry",
    async (
      _,
      search?: string,
      cursor?: string,
    ): Promise<{
      servers: {
        name: string;
        title: string;
        description: string;
        version: string;
        websiteUrl: string;
        repositoryUrl: string;
        officialStatus: string;
        remotes: { type: string; url: string }[];
        packages: {
          registryType: string;
          identifier: string;
          label: string;
        }[];
      }[];
      nextCursor: string | null;
      count: number;
    }> => {
      const params = new URLSearchParams({ limit: String(MCP_REGISTRY_PAGE_SIZE), version: "latest" });
      const trimmedSearch = typeof search === "string" ? search.trim() : "";
      if (trimmedSearch) params.set("search", trimmedSearch);
      if (cursor) params.set("cursor", cursor);

      const response = await fetch(
        `${MCP_REGISTRY_SERVERS_URL}?${params.toString()}`,
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch MCP registry (${response.status}).`);
      }

      const parsed = (await response.json()) as {
        servers?: Array<Record<string, unknown>>;
        metadata?: Record<string, unknown>;
      };

      const servers = Array.isArray(parsed.servers) ? parsed.servers : [];
      const normalized = servers.map((entry) => {
        const server = isPlainObject(entry.server) ? entry.server : entry;
        const meta = isPlainObject(server._meta)
          ? server._meta
          : isPlainObject(entry._meta)
            ? entry._meta
            : {};
        const officialMeta = isPlainObject(
          meta["io.modelcontextprotocol.registry/official"],
        )
          ? meta["io.modelcontextprotocol.registry/official"]
          : {};
        const remotes = Array.isArray(server.remotes) ? server.remotes : [];
        const packages = Array.isArray(server.packages) ? server.packages : [];

        return {
          name: textField(server.name) || "Unnamed server",
          title: textField(server.title),
          description: textField(server.description),
          version: textField(server.version),
          websiteUrl: textField(server.websiteUrl),
          repositoryUrl: isPlainObject(server.repository)
            ? textField(server.repository.url)
            : "",
          officialStatus: textField(officialMeta.status),
          remotes: remotes
            .map((remote) => {
              if (!isPlainObject(remote)) return null;
              const type = textField(remote.type);
              const url = textField(remote.url);
              return type && url ? { type, url } : null;
            })
            .filter((remote): remote is { type: string; url: string } =>
              Boolean(remote),
            ),
          packages: packages
            .map((pkg) => {
              if (!isPlainObject(pkg)) return null;
              const registryType =
                textField(pkg.registryType) || textField(pkg.registry_type);
              const identifier =
                textField(pkg.identifier) || textField(pkg.name);
              const registryName =
                textField(pkg.registryName) || textField(pkg.registry_name);
              const label =
                registryName && identifier
                  ? `${registryName}:${identifier}`
                  : identifier;
              return identifier ? { registryType, identifier, label } : null;
            })
            .filter(
              (
                pkg,
              ): pkg is {
                registryType: string;
                identifier: string;
                label: string;
              } => Boolean(pkg),
            ),
        };
      });

      const metadata = isPlainObject(parsed.metadata) ? parsed.metadata : {};
      const nextCursor = textField(metadata.nextCursor);

      return {
        servers: normalized,
        nextCursor: nextCursor || null,
        count:
          typeof metadata.count === "number" ? metadata.count : normalized.length,
      };
    },
  );

  ipcMain.handle("claude:open-marketplace-window", () => {
    const isDev = process.env.NODE_ENV === "development";
    const win = new BrowserWindow({
      width: 900,
      height: 680,
      title: "Plugin Marketplace",
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    if (isDev) {
      void win.loadURL(`${DEV_RENDERER_URL}?view=marketplace`);
    } else {
      void win.loadFile(path.join(__dirname, "../renderer/index.html"), {
        query: { view: "marketplace" },
      });
    }
  });

  ipcMain.handle(
    "claude:open-file-editor",
    (_, { targetPath, editorId }: OpenInEditorRequest) =>
      openInCodeEditor(targetPath, editorId),
  );

  ipcMain.handle("claude:open-file-vscode", (_, filePath: string) => {
    return openInCodeEditor(filePath, "vscode");
  });

  const signInUrl = () =>
    `${LANDING_URL}/sign-in?redirect_url=${encodeURIComponent(AUTH_REDIRECT_PATH)}`

  ipcMain.handle("auth:get-user", () => store.getAuthUser())

  ipcMain.handle("auth:sign-out", () => store.clearAuth())

  ipcMain.handle("auth:open-sign-in", () => {
    shell.openExternal(signInUrl())
  })

  ipcMain.handle("auth:get-sign-in-url", () => signInUrl())

  ipcMain.handle("updater:check-for-updates", () => {
    if (!app.isPackaged) return
    autoUpdater.checkForUpdates()
  });

  ipcMain.handle("updater:open-release-page", () => {
    shell.openExternal(LATEST_RELEASE_URL)
  });

}
