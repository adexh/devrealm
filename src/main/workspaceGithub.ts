import fs from "fs";
import path from "path";
import simpleGit from "simple-git";
import * as store from "./store";
import { normalizeGithubCloneUrl } from "./workspaceTransfer";
import { DEFAULT_GIT_BRANCH } from "./constants";
import type {
  Workspace,
  WorkspaceGithubChangeSummary,
  WorkspaceGithubConfig,
  WorkspaceGithubDiff,
  WorkspaceGithubDiffFile,
  WorkspaceGithubPushResult,
  WorkspaceGithubSyncResult,
} from "../shared/types";

const inFlightSyncs = new Map<string, Promise<WorkspaceGithubSyncResult>>();

function normalizeBranch(branch?: string): string {
  const trimmed = branch?.trim();
  return trimmed || DEFAULT_GIT_BRANCH;
}

export function normalizeWorkspaceGithubConfig(
  github?: Partial<WorkspaceGithubConfig> | null,
): WorkspaceGithubConfig | undefined {
  const repoUrl =
    typeof github?.repoUrl === "string"
      ? normalizeGithubCloneUrl(github.repoUrl)
      : null;
  if (!repoUrl) return undefined;

  return {
    repoUrl,
    branch: normalizeBranch(github?.branch),
  };
}

function result(
  workspace: Workspace,
  status: WorkspaceGithubSyncResult["status"],
  message?: string,
): WorkspaceGithubSyncResult {
  return {
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    status,
    message,
  };
}

function isGitCheckout(workspacePath: string): boolean {
  return fs.existsSync(path.join(workspacePath, ".git"));
}

function isEmptyDirectory(dirPath: string): boolean {
  if (!fs.existsSync(dirPath)) return true;
  return fs.readdirSync(dirPath).length === 0;
}

function getConfiguredWorkspace(workspaceId: string): {
  workspace: Workspace;
  github: WorkspaceGithubConfig;
  workspacePath: string;
} {
  const workspace = store.getWorkspaces().find((item) => item.id === workspaceId);
  if (!workspace) throw new Error("Workspace not found.");

  const github = normalizeWorkspaceGithubConfig(workspace.github);
  if (!github) throw new Error("No GitHub repo configured for this workspace.");
  if (!workspace.rootPath) throw new Error("Workspace path is missing.");

  const workspacePath = path.resolve(workspace.rootPath);
  if (!isGitCheckout(workspacePath)) {
    throw new Error("Workspace folder is not a git repository.");
  }

  return { workspace, github, workspacePath };
}

function parseNumstat(raw: string): { additions: number; deletions: number; changedFiles: number } {
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .reduce(
      (total, line) => {
        const [added, deleted] = line.split(/\s+/);
        return {
          additions: total.additions + (Number.parseInt(added, 10) || 0),
          deletions: total.deletions + (Number.parseInt(deleted, 10) || 0),
          changedFiles: total.changedFiles + 1,
        };
      },
      { additions: 0, deletions: 0, changedFiles: 0 },
    );
}

function parseNumstatFiles(raw: string): Map<string, { additions: number; deletions: number }> {
  const entries = new Map<string, { additions: number; deletions: number }>();
  raw
    .split(/\r?\n/)
    .filter(Boolean)
    .forEach((line) => {
      const [added, deleted, ...pathParts] = line.split(/\s+/);
      const filePath = pathParts.join(" ");
      if (!filePath) return;
      entries.set(filePath, {
        additions: Number.parseInt(added, 10) || 0,
        deletions: Number.parseInt(deleted, 10) || 0,
      });
    });
  return entries;
}

function countFileLines(filePath: string): number {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return 0;
    const content = fs.readFileSync(filePath, "utf8");
    if (!content) return 0;
    return content.split(/\r?\n/).length;
  } catch {
    return 0;
  }
}

async function summarizeWorkspaceChanges(
  workspaceId: string,
): Promise<WorkspaceGithubChangeSummary> {
  const { workspace, github, workspacePath } = getConfiguredWorkspace(workspaceId);
  const git = simpleGit(workspacePath);
  const [diffRaw, status] = await Promise.all([
    git.diff(["--numstat", "HEAD"]),
    git.status(),
  ]);
  const tracked = parseNumstat(diffRaw);
  const untrackedAdditions = status.not_added.reduce((total, relativePath) => {
    return total + countFileLines(path.join(workspacePath, relativePath));
  }, 0);
  const changedFiles = new Set([
    ...status.modified,
    ...status.created,
    ...status.deleted,
    ...status.renamed.map((entry) => entry.to),
    ...status.not_added,
  ]);

  return {
    workspaceId: workspace.id,
    branch: github.branch,
    additions: tracked.additions + untrackedAdditions,
    deletions: tracked.deletions,
    changedFiles: Math.max(tracked.changedFiles, changedFiles.size),
    hasChanges: !status.isClean(),
  };
}

function statusLabel(status: string): string {
  if (status.includes("R")) return "renamed";
  if (status.includes("A") || status.includes("?")) return "added";
  if (status.includes("D")) return "deleted";
  if (status.includes("M")) return "modified";
  return status.trim() || "changed";
}

async function getWorkspaceDiff(workspaceId: string): Promise<WorkspaceGithubDiff> {
  const { workspacePath } = getConfiguredWorkspace(workspaceId);
  const git = simpleGit(workspacePath);
  const [summary, diffRaw, status] = await Promise.all([
    summarizeWorkspaceChanges(workspaceId),
    git.diff(["--numstat", "HEAD"]),
    git.status(),
  ]);
  const numstatByPath = parseNumstatFiles(diffRaw);

  const files = status.files.map((file): WorkspaceGithubDiffFile => {
    const filePath = file.path;
    const numstat = numstatByPath.get(filePath);
    const untracked = file.index === "?" || file.working_dir === "?";
    return {
      path: filePath,
      status: statusLabel(`${file.index}${file.working_dir}`),
      additions: numstat?.additions ?? (untracked ? countFileLines(path.join(workspacePath, filePath)) : 0),
      deletions: numstat?.deletions ?? 0,
    };
  });

  return {
    ...summary,
    files,
  };
}

async function checkoutConfiguredBranch(
  workspacePath: string,
  branch: string,
): Promise<void> {
  const git = simpleGit(workspacePath);
  const localBranches = await git.branchLocal();
  if (localBranches.current === branch) return;

  if (localBranches.all.includes(branch)) {
    await git.checkout(branch);
    return;
  }

  await git.checkout(["-B", branch, `origin/${branch}`]);
}

async function runWorkspaceGithubSync(
  workspace: Workspace,
): Promise<WorkspaceGithubSyncResult> {
  const github = normalizeWorkspaceGithubConfig(workspace.github);
  if (!github) return result(workspace, "skipped", "No GitHub repo configured.");
  if (!workspace.rootPath)
    return result(workspace, "skipped", "Workspace path is missing.");

  const workspacePath = path.resolve(workspace.rootPath);
  try {
    if (!fs.existsSync(workspacePath)) {
      fs.mkdirSync(path.dirname(workspacePath), { recursive: true });
      await simpleGit().clone(github.repoUrl, workspacePath, [
        "--branch",
        github.branch,
      ]);
      return result(workspace, "cloned", `Cloned ${github.branch}.`);
    }

    if (!isGitCheckout(workspacePath)) {
      if (!isEmptyDirectory(workspacePath)) {
        return result(
          workspace,
          "error",
          "Workspace folder is not a git repository.",
        );
      }

      await simpleGit().clone(github.repoUrl, workspacePath, [
        "--branch",
        github.branch,
      ]);
      return result(workspace, "cloned", `Cloned ${github.branch}.`);
    }

    const git = simpleGit(workspacePath);
    await git.fetch("origin", github.branch);
    await checkoutConfiguredBranch(workspacePath, github.branch);

    const behindRaw = await git.raw([
      "rev-list",
      "--count",
      `HEAD..origin/${github.branch}`,
    ]);
    const behind = Number.parseInt(behindRaw.trim(), 10) || 0;
    if (behind <= 0) {
      return result(workspace, "up-to-date", `${github.branch} is up to date.`);
    }

    await git.pull("origin", github.branch);
    return result(workspace, "pulled", `Pulled ${behind} commit${behind === 1 ? "" : "s"}.`);
  } catch (error) {
    return result(
      workspace,
      "error",
      error instanceof Error ? error.message : "GitHub sync failed.",
    );
  }
}

export function syncWorkspaceGithub(
  workspace: Workspace,
): Promise<WorkspaceGithubSyncResult> {
  const existing = inFlightSyncs.get(workspace.id);
  if (existing) return existing;

  const sync = runWorkspaceGithubSync(workspace).finally(() => {
    inFlightSyncs.delete(workspace.id);
  });
  inFlightSyncs.set(workspace.id, sync);
  return sync;
}

export async function syncWorkspaceGithubById(
  workspaceId: string,
): Promise<WorkspaceGithubSyncResult | null> {
  const workspace = store.getWorkspaces().find((item) => item.id === workspaceId);
  if (!workspace) return null;
  return syncWorkspaceGithub(workspace);
}

export async function syncAllWorkspaceGithub(): Promise<
  WorkspaceGithubSyncResult[]
> {
  const workspaces = store
    .getWorkspaces()
    .filter((workspace) => normalizeWorkspaceGithubConfig(workspace.github));
  return Promise.all(workspaces.map(syncWorkspaceGithub));
}

export async function getWorkspaceGithubChangeSummary(
  workspaceId: string,
): Promise<WorkspaceGithubChangeSummary | null> {
  const workspace = store.getWorkspaces().find((item) => item.id === workspaceId);
  if (!workspace || !normalizeWorkspaceGithubConfig(workspace.github)) return null;
  return summarizeWorkspaceChanges(workspaceId);
}

export async function getWorkspaceGithubDiff(
  workspaceId: string,
): Promise<WorkspaceGithubDiff | null> {
  const workspace = store.getWorkspaces().find((item) => item.id === workspaceId);
  if (!workspace || !normalizeWorkspaceGithubConfig(workspace.github)) return null;
  return getWorkspaceDiff(workspaceId);
}

export async function pushWorkspaceGithubChanges(
  workspaceId: string,
  message: string,
): Promise<WorkspaceGithubPushResult> {
  const commitMessage = message.trim();
  if (!commitMessage) throw new Error("A commit message is required.");

  const { workspace, github, workspacePath } = getConfiguredWorkspace(workspaceId);
  const git = simpleGit(workspacePath);
  const summary = await summarizeWorkspaceChanges(workspaceId);
  if (!summary.hasChanges) throw new Error("There are no changes to push.");

  await checkoutConfiguredBranch(workspacePath, github.branch);
  await git.add(["-A"]);
  const commit = await git.commit(commitMessage);
  await git.push("origin", github.branch);

  return {
    workspaceId: workspace.id,
    branch: github.branch,
    commitHash: commit.commit,
    message: commitMessage,
  };
}
