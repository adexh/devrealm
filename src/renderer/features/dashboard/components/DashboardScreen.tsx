import React, { useState, useEffect, useMemo, useRef } from "react";
import type { Workspace, Repo } from "../../../../shared/types";
import {
  Box,
  Btn,
  Chip,
  Label,
  Heading,
  Mono,
  Bar,
  FolderIcon,
  AIIcon,
  GitIcon,
  Modal,
} from "../../../components/ui";
import { useWorkspaceStore } from "../../../stores/workspaceStore";
import { useNavigationStore } from "../../../stores/navigationStore";
import { STALE_REPO_MS } from "../../../constants";
import { WORKSPACE_CREATE_MODES, workspaceCreateModeLabel } from "../constants/workspaceModes";
import type { WorkspaceCreateMode } from "../types/workspaceMode";
import { ImportWorkspaceForm } from "./ImportWorkspaceForm";
import { browseWorkspaceDir, cloneWorkspaceGithub, createWorkspace, exportWorkspace, openWorkspaceFromDir, updateWorkspace } from "../ipc/workspaces";
import { checkRepoAiCoverage } from "../ipc/repos";
import { CloneTerminal, type CloneTerminalHandle } from "../../workspace/components/CloneTerminal";

function buildGithubConfig(repoUrl: string, branch: string) {
  const trimmedRepoUrl = repoUrl.trim();
  if (!trimmedRepoUrl) return undefined;
  return {
    repoUrl: trimmedRepoUrl,
    branch: branch.trim() || "main",
  };
}

// ─── Empty State ──────────────────────────────────────────────
export function DashboardEmpty() {
  const fetch = useWorkspaceStore(s => s.fetch)
  const [mode, setMode] = useState<WorkspaceCreateMode>("create");

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 p-6 flex flex-col items-center justify-center">
        <Box dashed className="p-6 flex flex-col gap-3 w-full max-w-xl">
          <Heading size={18}>Create or Open Workspace</Heading>
          <div className="text-xs text-t-ink-soft leading-[1.55]">
            A workspace is a named group of git repos. Create one from scratch,
            or open a folder to auto-import repos inside it.
          </div>

          {/* Mode toggle */}
          <div className="flex border border-t-line rounded self-start">
            {WORKSPACE_CREATE_MODES.map((m) => (
              <div
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1.25 text-xs font-medium cursor-pointer select-none
                  ${mode === m ? "bg-t-accent-bg text-t-accent-ink" : "bg-transparent text-t-ink-soft"}
                  ${m !== "import" ? "border-r border-t-line" : ""}`}
              >
                {workspaceCreateModeLabel(m)}
              </div>
            ))}
          </div>

          {mode === "create" ? (
            <CreateWorkspaceForm onCreated={fetch} />
          ) : mode === "open" ? (
            <OpenFromFolderForm onCreated={fetch} />
          ) : (
            <ImportWorkspaceForm onImported={fetch} />
          )}
        </Box>
      </div>
    </div>
  );
}

// ─── Shared sub-forms ─────────────────────────────────────────
function CreateWorkspaceForm({
  onCreated,
  onCancel,
}: {
  onCreated: () => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [rootPath, setRootPath] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [githubBranch, setGithubBranch] = useState("main");
  const [loading, setLoading] = useState(false);
  const [cloneWorkspace, setCloneWorkspace] = useState<Workspace | null>(null);

  async function browseDir() {
    const dir = await browseWorkspaceDir();
    if (dir) {
      setRootPath(dir);
      if (!name.trim()) setName(dir.split("/").pop() ?? "");
    }
  }

  async function handleCreate() {
    if (!name.trim() || !rootPath) return;
    const github = buildGithubConfig(githubUrl, githubBranch);
    setLoading(true);
    try {
      const workspace = await createWorkspace({
        name: name.trim(),
        description: desc.trim() || undefined,
        rootPath,
        github,
      });
      if (github) {
        setCloneWorkspace(workspace);
      } else {
        onCreated();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        autoFocus
        placeholder="Workspace name…"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        className="h-8 border border-t-line rounded px-2.5 text-[13px] bg-t-bg text-t-ink outline-none w-full"
      />
      <input
        placeholder="Description (optional)"
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        className="h-8 border border-t-line rounded px-2.5 text-[13px] bg-t-bg text-t-ink outline-none w-full"
      />
      {/* Directory row */}
      <div className="flex gap-1.5 items-center">
        <Box className="flex-1 h-8 flex items-center px-2.5 gap-1.5 overflow-hidden">
          <FolderIcon size={12} />
          <span
            className={`text-[11px] flex-1 overflow-hidden text-ellipsis whitespace-nowrap ${rootPath ? "text-t-ink" : "text-t-ink-softer"}`}
          >
            {rootPath || "Select a directory…"}
          </span>
        </Box>
        <Btn onClick={browseDir} className="shrink-0">
          Browse…
        </Btn>
      </div>
      <GithubConfigFields
        repoUrl={githubUrl}
        branch={githubBranch}
        onRepoUrlChange={setGithubUrl}
        onBranchChange={setGithubBranch}
        onEnter={handleCreate}
      />
      <div className="flex gap-2">
        <Btn
          primary
          onClick={handleCreate}
          style={{ opacity: name.trim() && rootPath ? 1 : 0.5 }}
        >
          {loading ? "Creating…" : "Create workspace"}
        </Btn>
        {onCancel && <Btn onClick={onCancel}>Cancel</Btn>}
      </div>
      {cloneWorkspace && (
        <WorkspaceGithubCloneModal
          workspace={cloneWorkspace}
          onDone={() => {
            setCloneWorkspace(null);
            onCreated();
          }}
          onClose={() => {
            setCloneWorkspace(null);
            onCreated();
          }}
        />
      )}
    </div>
  );
}

function OpenFromFolderForm({
  onCreated,
  onCancel,
}: {
  onCreated: () => void;
  onCancel?: () => void;
}) {
  const [dirPath, setDirPath] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [githubBranch, setGithubBranch] = useState("main");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [cloneWorkspace, setCloneWorkspace] = useState<Workspace | null>(null);

  async function browseDir() {
    const dir = await browseWorkspaceDir();
    if (dir) {
      setDirPath(dir);
      setPreview(dir.split("/").pop() ?? dir);
    }
  }

  async function handleOpen() {
    if (!dirPath) return;
    const github = buildGithubConfig(githubUrl, githubBranch);
    setLoading(true);
    try {
      const result = await openWorkspaceFromDir({
        dirPath,
        github,
      });
      if (github) {
        setCloneWorkspace(result.workspace);
      } else {
        onCreated();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs text-t-ink-soft leading-normal">
        Select a folder — we'll scan it for git repos and create a workspace
        named after the folder.
      </div>
      <div className="flex gap-1.5 items-center">
        <Box className="flex-1 h-9 flex items-center px-3 gap-2">
          <FolderIcon />
          <span
            className={`text-xs flex-1 overflow-hidden text-ellipsis whitespace-nowrap ${dirPath ? "text-t-ink" : "text-t-ink-softer"}`}
          >
            {dirPath || "~/Select a folder…"}
          </span>
        </Box>
        <Btn onClick={browseDir} className="shrink-0">
          Browse…
        </Btn>
      </div>
      {preview && (
        <div className="text-[11px] text-t-ink-soft">
          Will create workspace{" "}
          <strong className="text-t-ink">{preview}</strong> and import all git
          repos found inside.
        </div>
      )}
      <GithubConfigFields
        repoUrl={githubUrl}
        branch={githubBranch}
        onRepoUrlChange={setGithubUrl}
        onBranchChange={setGithubBranch}
        onEnter={handleOpen}
      />
      <div className="flex gap-2">
        <Btn
          primary
          onClick={handleOpen}
          style={{ opacity: dirPath ? 1 : 0.5 }}
        >
          {loading ? "Scanning…" : "Open folder as workspace"}
        </Btn>
        {onCancel && <Btn onClick={onCancel}>Cancel</Btn>}
      </div>
      {cloneWorkspace && (
        <WorkspaceGithubCloneModal
          workspace={cloneWorkspace}
          onDone={() => {
            setCloneWorkspace(null);
            onCreated();
          }}
          onClose={() => {
            setCloneWorkspace(null);
            onCreated();
          }}
        />
      )}
    </div>
  );
}

function WorkspaceGithubCloneModal({
  workspace,
  onDone,
  onClose,
}: {
  workspace: Workspace;
  onDone: () => void;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<"cloning" | "error">("cloning");
  const [error, setError] = useState("");
  const terminalRef = useRef<CloneTerminalHandle>(null);
  const stoppedRef = useRef(false);
  const onDoneRef = useRef(onDone);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onDoneRef.current = onDone;
    onCloseRef.current = onClose;
  }, [onClose, onDone]);

  useEffect(() => {
    stoppedRef.current = false;
    setStatus("cloning");
    setError("");
    const stopListening = window.electronAPI.repos.onCloneProgress((line: string) => {
      terminalRef.current?.write(line);
    });

    cloneWorkspaceGithub(workspace.id)
      .then(() => {
        stopListening();
        onDoneRef.current();
      })
      .catch((e: unknown) => {
        stopListening();
        if (stoppedRef.current) {
          onCloseRef.current();
          return;
        }
        setStatus("error");
        setError(e instanceof Error ? e.message : "Clone failed");
      });

    return () => stopListening();
  }, [workspace.id]);

  function handleClose() {
    if (status === "cloning") {
      stoppedRef.current = true;
      void window.electronAPI.repos.stopClone();
    }
    onCloseRef.current();
  }

  return (
    <Modal title="Clone workspace" onClose={handleClose} width={560} disableBackdropClose={status === "cloning"}>
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <GitIcon size={13} />
          <Mono size={11} className="truncate">{workspace.github?.repoUrl}</Mono>
          <Chip>{workspace.github?.branch ?? "main"}</Chip>
        </div>
        <CloneTerminal ref={terminalRef} />
        {status === "error" && (
          <div className="text-[11px] text-[#e05252] px-2 py-1.5 border border-[#e05252] rounded-[3px]">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2">
          {status === "cloning" ? (
            <Btn onClick={handleClose}>Stop</Btn>
          ) : (
            <Btn onClick={handleClose}>Close</Btn>
          )}
        </div>
      </div>
    </Modal>
  );
}

function GithubConfigFields({
  repoUrl,
  branch,
  onRepoUrlChange,
  onBranchChange,
  onEnter,
}: {
  repoUrl: string;
  branch: string;
  onRepoUrlChange: (value: string) => void;
  onBranchChange: (value: string) => void;
  onEnter: () => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_110px] gap-1.5">
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
          <GitIcon size={12} />
        </span>
        <input
          placeholder="GitHub repo (optional)"
          value={repoUrl}
          onChange={(e) => onRepoUrlChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onEnter()}
          className="h-8 border border-t-line rounded pl-7 pr-2.5 text-[13px] bg-t-bg text-t-ink outline-none w-full"
        />
      </div>
      <input
        placeholder="main"
        value={branch}
        onChange={(e) => onBranchChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter()}
        className="h-8 border border-t-line rounded px-2.5 text-[13px] bg-t-bg text-t-ink outline-none w-full"
      />
    </div>
  );
}

// ─── Populated (Workspaces Manager) ───────────────────────────
export function WorkspacesManager() {
  const { workspaces, repos, fetch: onRefresh } = useWorkspaceStore()
  const { setSelectedWorkspaceId: onWorkspaceClick, navigateToAIConfig: onSetDefault } = useNavigationStore()
  const [sort, setSort] = useState<"recent" | "name" | "size" | "repos">(
    "recent",
  );
  const [filter, setFilter] = useState<"all" | "ai" | "stale">("all");
  const [showNewWS, setShowNewWS] = useState(false);
  const [newWSMode, setNewWSMode] = useState<WorkspaceCreateMode>("create");
  const [menuWorkspaceId, setMenuWorkspaceId] = useState<string | null>(null);
  const [renameWorkspaceId, setRenameWorkspaceId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [coverageMap, setCoverageMap] = useState<Record<string, boolean>>({});
  const menuRef = useRef<HTMLDivElement | null>(null);
  const reposByWorkspaceId = useMemo(() => {
    const map = new Map<string, Repo[]>();
    repos.forEach(repo => {
      const workspaceRepos = map.get(repo.workspaceId) ?? [];
      workspaceRepos.push(repo);
      map.set(repo.workspaceId, workspaceRepos);
    });
    return map;
  }, [repos]);
  const workspaceByRepoId = useMemo(() => {
    const workspaceById = new Map(workspaces.map(workspace => [workspace.id, workspace]));
    const map = new Map<string, Workspace>();
    repos.forEach(repo => {
      const workspace = workspaceById.get(repo.workspaceId);
      if (workspace) map.set(repo.id, workspace);
    });
    return map;
  }, [repos, workspaces]);

  async function handleExport(ws: Workspace) {
    setMenuWorkspaceId(null);
    await exportWorkspace(ws.id);
  }

  function handleRename(ws: Workspace) {
    setMenuWorkspaceId(null);
    setRenameDraft(ws.name);
    setRenameWorkspaceId(ws.id);
  }

  async function confirmRename() {
    const ws = workspaces.find(w => w.id === renameWorkspaceId);
    if (!ws || !renameDraft.trim()) return;
    await updateWorkspace({ ...ws, name: renameDraft.trim() });
    await onRefresh();
    setRenameWorkspaceId(null);
  }

  useEffect(() => {
    let cancelled = false;
    const items: { id: string; path: string }[] = [
      ...workspaces.filter(ws => ws.rootPath).map(ws => ({ id: ws.id, path: ws.rootPath! })),
      ...repos.filter(r => r.path).map(r => ({ id: r.id, path: r.path })),
    ];
    if (!items.length) {
      setCoverageMap({});
      return;
    }
    checkRepoAiCoverage(items).then(nextCoverageMap => {
      if (!cancelled) setCoverageMap(nextCoverageMap);
    });
    return () => { cancelled = true; };
  }, [workspaces, repos]);

  useEffect(() => {
    if (!menuWorkspaceId) return;

    function handleOutsideClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current?.contains(target)) return;
      setMenuWorkspaceId(null);
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [menuWorkspaceId]);

  const totalSize = repos.reduce((a, r) => a + r.size, 0);
  const totalStale = repos.filter(
    (r) => Date.now() - r.lastOpenedAt > STALE_REPO_MS,
  ).length;

  function getWorkspaceRepos(ws: Workspace): Repo[] {
    return reposByWorkspaceId.get(ws.id) ?? [];
  }

  function wsSize(ws: Workspace) {
    return getWorkspaceRepos(ws).reduce((a, r) => a + r.size, 0);
  }

  function wsLastOpened(ws: Workspace): number {
    const r = getWorkspaceRepos(ws);
    return r.length ? Math.max(...r.map((r) => r.lastOpenedAt)) : ws.createdAt;
  }

  function wsStale(ws: Workspace): number {
    return getWorkspaceRepos(ws).filter(
      (r) => Date.now() - r.lastOpenedAt > STALE_REPO_MS,
    ).length;
  }

  function wsAICoverage(ws: Workspace) {
    const r = getWorkspaceRepos(ws);
    const covered = r.filter((repo) => coverageMap[repo.id]).length;
    return { covered, total: r.length, wsHasClaude: coverageMap[ws.id] ?? false };
  }

  let sorted = [...workspaces];
  if (sort === "recent")
    sorted.sort((a, b) => wsLastOpened(b) - wsLastOpened(a));
  if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === "size") sorted.sort((a, b) => wsSize(b) - wsSize(a));
  if (sort === "repos")
    sorted.sort((a, b) => getWorkspaceRepos(b).length - getWorkspaceRepos(a).length);

  if (filter === "ai") sorted = sorted.filter((ws) => {
    const { covered, wsHasClaude } = wsAICoverage(ws);
    return wsHasClaude || covered > 0;
  });
  if (filter === "stale") sorted = sorted.filter((ws) => wsStale(ws) > 0);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Sub-header */}
      <div className="px-6 py-4 border-b border-t-line flex items-center gap-3 flex-none">
        <Heading size={15}>Workspaces</Heading>
        <Mono size={11} soft>
          · {workspaces.length} workspaces · {repos.length} repos ·{" "}
          {fmtSize(totalSize)}
        </Mono>
        <div className="flex-1" />
        <Btn
          onClick={() => {
            setNewWSMode("open");
            setShowNewWS(true);
          }}
        >
          Open folder
        </Btn>
        <Btn
          primary
          onClick={() => {
            setNewWSMode("create");
            setShowNewWS(true);
          }}
        >
          + New workspace
        </Btn>
      </div>

      <div className="flex-1 overflow-auto px-6 pt-4 pb-6 flex flex-col gap-3.5">
        {/* Summary strip */}
        <div className="grid grid-cols-4 gap-2.5">
          <SummaryStat
            label="Total disk"
            value={fmtSize(totalSize)}
            hint="of disk space"
            bar={totalSize / (256 * 1e9)}
          />
          <SummaryStat
            label="Active this week"
            value={String(
              workspaces.filter(
                (ws) => wsLastOpened(ws) > Date.now() - 7 * 86400000,
              ).length,
            )}
            hint="workspaces with recent activity"
          />
          <SummaryStat
            label="Stale repos"
            value={String(totalStale)}
            hint="not opened in 30+ days"
          />
          {(() => {
            const coveredCount = repos.filter((r) => {
              if (coverageMap[r.id]) return true;
              const ws = workspaceByRepoId.get(r.id);
              return ws ? (coverageMap[ws.id] ?? false) : false;
            }).length;
            return (
              <SummaryStat
                label="AI coverage"
                value={`${Math.round((coveredCount / Math.max(repos.length, 1)) * 100)}%`}
                hint={`${coveredCount} / ${repos.length} repos covered`}
                bar={coveredCount / Math.max(repos.length, 1)}
              />
            );
          })()}
        </div>

        {/* Sort / filter row */}
        <div className="flex items-center gap-2">
          <Label>Sort</Label>
          {(["recent", "name", "size", "repos"] as const).map((s) => (
            <Chip key={s} accent={sort === s} onClick={() => setSort(s)}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Chip>
          ))}
          <div className="flex-1" />
          <Label>Filter</Label>
          <Chip
            accent={filter === "ai"}
            onClick={() => setFilter(filter === "ai" ? "all" : "ai")}
          >
            Has AI config
          </Chip>
          <Chip
            accent={filter === "stale"}
            onClick={() => setFilter(filter === "stale" ? "all" : "stale")}
          >
            Contains stale
          </Chip>
        </div>

        {/* New workspace modal */}
        {showNewWS && (
          <Modal
            title="New workspace"
            onClose={() => setShowNewWS(false)}
            width={480}
          >
            <div className="flex flex-col gap-3">
              <div className="flex border border-t-line rounded self-start">
                {WORKSPACE_CREATE_MODES.map((m) => (
                  <div
                    key={m}
                    onClick={() => setNewWSMode(m)}
                    className={`px-3 py-1 text-[11px] font-medium cursor-pointer select-none
                      ${newWSMode === m ? "bg-t-accent-bg text-t-accent-ink" : "bg-transparent text-t-ink-soft"}
                      ${m !== "import" ? "border-r border-t-line" : ""}`}
                  >
                    {workspaceCreateModeLabel(m)}
                  </div>
                ))}
              </div>
              {newWSMode === "create" ? (
                <CreateWorkspaceForm
                  onCreated={() => {
                    setShowNewWS(false);
                    onRefresh();
                  }}
                  onCancel={() => setShowNewWS(false)}
                />
              ) : newWSMode === "open" ? (
                <OpenFromFolderForm
                  onCreated={() => {
                    setShowNewWS(false);
                    onRefresh();
                  }}
                  onCancel={() => setShowNewWS(false)}
                />
              ) : (
                <ImportWorkspaceForm
                  onImported={() => {
                    setShowNewWS(false);
                    onRefresh();
                  }}
                  onCancel={() => setShowNewWS(false)}
                />
              )}
            </div>
          </Modal>
        )}

        {/* Workspace cards grid */}
        <div className="grid grid-cols-3 gap-3 content-start">
          {sorted.map((ws, i) => {
            const wsRepos = getWorkspaceRepos(ws);
            const staleCount = wsStale(ws);
            const { covered, wsHasClaude } = wsAICoverage(ws);
            return (
              <Box key={ws.id} className="p-3.5 flex flex-col gap-2.5 min-h-45">
                <div
                  ref={menuWorkspaceId === ws.id ? menuRef : null}
                  className="relative flex items-center gap-2"
                >
                  <FolderIcon />
                  <Heading size={14}>{ws.name}</Heading>
                  <div className="flex-1" />
                  {ws.github && <Chip>Git {ws.github.branch}</Chip>}
                  {staleCount > 0 && <Chip>{staleCount} stale</Chip>}
                  <Mono
                    size={12}
                    soft
                    className="cursor-pointer select-none px-1"
                    onClick={() => setMenuWorkspaceId(menuWorkspaceId === ws.id ? null : ws.id)}
                  >
                    ⋯
                  </Mono>
                  {menuWorkspaceId === ws.id && (
                    <div className="absolute right-0 top-6 z-10 min-w-32 overflow-hidden rounded border border-t-line bg-t-bg shadow-sm">
                      <button
                        type="button"
                        onClick={() => handleRename(ws)}
                        className="w-full px-3 py-2 text-left text-[12px] font-medium text-t-ink hover:bg-t-panel cursor-pointer"
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExport(ws)}
                        className="w-full px-3 py-2 text-left text-[12px] font-medium text-t-ink hover:bg-t-panel cursor-pointer"
                      >
                        Export
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex gap-3.5">
                  <div>
                    <Label style={{ fontSize: 9 }}>Repos</Label>
                    <div className="text-[17px] font-semibold">
                      {wsRepos.length}
                    </div>
                  </div>
                  <div>
                    <Label style={{ fontSize: 9 }}>Size</Label>
                    <div className="text-[17px] font-semibold">
                      {fmtSize(wsSize(ws))}
                    </div>
                  </div>
                  <div>
                    <Label style={{ fontSize: 9 }}>Last opened</Label>
                    <div className="text-xs font-medium pt-0.5">
                      {relTime(wsLastOpened(ws))}
                    </div>
                  </div>
                </div>

                <div className={`py-2 px-2.5 rounded-xl flex items-center gap-2 border-2 ${wsHasClaude ? "border-green-700/50 dark:border-green-800/50" : covered > 0 ? "border-orange-400/50 dark:border-orange-700/60" : "border-red-500/50 dark:border-red-900/60"}`}>
                  <AIIcon size={12} />
                  {wsHasClaude || covered > 0 ? (
                    <>
                      <Mono size={11} >AI Config → {wsHasClaude ? "Workspace" : "Repos Only"}</Mono>
                      <div className="flex-1" />
                      <Mono size={10} soft className="underline cursor-pointer" onClick={() => onSetDefault(ws.id)}>
                        View
                      </Mono>
                    </>
                  ) : (
                    <>
                      <Mono size={11} >AI Config → No Setup</Mono>
                      <div className="flex-1" />
                      <Mono size={10} soft className="underline cursor-pointer" onClick={() => onSetDefault(ws.id)}>
                        Set
                      </Mono>
                    </>
                  )}
                </div>

                <div className="flex gap-1.5 pt-1 border-t border-t-line-soft">
                  <Btn
                    style={{ padding: "4px 10px", fontSize: 11 }}
                    onClick={() => onWorkspaceClick(ws.id)}
                  >
                    Open →
                  </Btn>
                </div>
              </Box>
            );
          })}

          {/* New workspace card */}
          <Box
            dashed
            className="p-3.5 flex flex-col gap-2 items-center justify-center min-h-45 cursor-pointer"
            onClick={() => {
              setNewWSMode("create");
              setShowNewWS(true);
            }}
          >
            <div className="text-xl text-t-ink-soft">+</div>
            <div className="text-xs text-t-ink-soft">New workspace</div>
          </Box>
        </div>
      </div>
      {renameWorkspaceId && (
        <Modal onClose={() => setRenameWorkspaceId(null)}>
          <div className="flex flex-col gap-4 p-4 min-w-72">
            <Heading size={14}>Rename Workspace</Heading>
            <input
              autoFocus
              value={renameDraft}
              onChange={e => setRenameDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') confirmRename();
                if (e.key === 'Escape') setRenameWorkspaceId(null);
              }}
              className="rounded border border-t-line bg-t-bg px-3 py-1.5 text-sm text-t-ink outline-none focus:border-t-ink"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenameWorkspaceId(null)}
                className="px-3 py-1.5 text-xs text-t-soft hover:text-t-ink cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmRename}
                className="px-3 py-1.5 text-xs font-medium bg-t-ink text-t-bg rounded cursor-pointer"
              >
                Rename
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  hint,
  bar,
}: {
  label: string;
  value: string;
  hint: string;
  bar?: number;
}) {
  return (
    <Box className="p-3 flex flex-col gap-1.5">
      <Label>{label}</Label>
      <span className="text-xl font-semibold tracking-[-0.3px]">{value}</span>
      {bar !== undefined && <Bar value={bar} height={4} />}
      <Mono size={10} soft>
        {hint}
      </Mono>
    </Box>
  );
}

export function fmtSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function relTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}
