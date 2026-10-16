import fs from "fs";
import os from "os";
import path from "path";
import {
  TEMPLATE_EXPORT_FORMAT,
  TEMPLATE_EXPORT_VERSION,
  type ScaffoldAction,
  type ScaffoldMode,
  type ScaffoldPlanEntry,
  type ScaffoldTemplate,
  type TemplateDraft,
  type TemplateFile,
  type TemplateKind,
  type TemplatePlugin,
} from "../../shared/templates";
import { isPlainObject, parseJsonObject } from "../claudeJson";

const CLAUDE_DIR = ".claude";
const ROOT_FILES = ["CLAUDE.md", "CLAUDE.local.md", "AGENTS.md", ".mcp.json"];
const IGNORED_DIRS = new Set(["node_modules", ".git"]);
const IGNORED_CLAUDE_DIRS = [`${CLAUDE_DIR}/worktrees/`];
const USER_CLAUDE_MD = `${CLAUDE_DIR}/CLAUDE.md`;
// ~/.claude also holds transcripts, history and credentials, so the user scope reads and writes only these.
const USER_CONFIG_PATHS = [
  /^\.claude\/(?:CLAUDE\.md|settings(?:\.local)?\.json)$/,
  /^\.claude\/hooks\/[^/]*$/,
  /^\.claude\/(?:agents|commands|skills|rules|output-styles)\//,
];
const MAX_FILE_BYTES = 512 * 1024;
// Both reach the `claude` CLI as arguments, so anything outside these shapes is dropped.
export const PLUGIN_ID = /^[\w.-]+@[\w.-]+$/;
export const MARKETPLACE_SOURCE = /^(?:[\w.-]+\/[\w.-]+|https:\/\/[\w.\/~-]+(?:\.git)?)$/;

type PlannedWrite = ScaffoldPlanEntry & { content?: string };

function toPosix(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

export function isScaffoldablePath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  if (!normalized || path.isAbsolute(normalized) || normalized.split("/").includes("..")) return false;
  if (IGNORED_CLAUDE_DIRS.some((dir) => normalized.startsWith(dir))) return false;
  return ROOT_FILES.includes(normalized) || normalized.startsWith(`${CLAUDE_DIR}/`);
}

/** The native realpath resolves symlinks and, on case-insensitive disks, the on-disk casing. */
function canonicalPath(target: string): string {
  try {
    return fs.realpathSync.native(target);
  } catch {
    return path.resolve(target);
  }
}

export function isSamePath(a: string, b: string): boolean {
  return canonicalPath(a) === canonicalPath(b);
}

export function isUserHome(rootPath: string): boolean {
  return isSamePath(rootPath, os.homedir());
}

export function isUserConfigPath(relativePath: string): boolean {
  return USER_CONFIG_PATHS.some((pattern) => pattern.test(relativePath));
}

function pathFilter(rootPath: string): (relativePath: string) => boolean {
  if (!isUserHome(rootPath)) return isScaffoldablePath;
  return (relativePath) => isScaffoldablePath(relativePath) && isUserConfigPath(relativePath);
}

/**
 * Symlinks may point anywhere, so a read or write must land, once resolved, on
 * a path the scope allows. Inside the root is not enough: a link to the
 * project's .env or to ~/.ssh is inside the root but is not AI config.
 */
function landsOnAllowedPath(rootPath: string, absolutePath: string, allowed: (relativePath: string) => boolean, isDirectory = false): boolean {
  let existing = absolutePath;
  while (!fs.lstatSync(existing, { throwIfNoEntry: false })) existing = path.dirname(existing);
  try {
    const resolved = path.join(fs.realpathSync(existing), path.relative(existing, absolutePath));
    const relative = path.relative(fs.realpathSync(rootPath), resolved);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return false;
    return allowed(isDirectory ? `${toPosix(relative)}/` : toPosix(relative));
  } catch {
    return false;
  }
}

function readTextFile(rootPath: string, absolutePath: string, allowed: (relativePath: string) => boolean): string | null {
  if (!landsOnAllowedPath(rootPath, absolutePath, allowed)) return null;
  const stat = fs.statSync(absolutePath);
  if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null;
  const content = fs.readFileSync(absolutePath, "utf8");
  return content.includes("\u0000") ? null : content;
}

export function captureFiles(rootPath: string): TemplateFile[] {
  if (!fs.existsSync(rootPath)) throw new Error(`${rootPath} does not exist.`);
  const files: TemplateFile[] = [];
  const allowed = pathFilter(rootPath);

  const add = (absolutePath: string) => {
    const relativePath = toPosix(path.relative(rootPath, absolutePath));
    if (!allowed(relativePath)) return;
    const content = readTextFile(rootPath, absolutePath, allowed);
    if (content !== null) files.push({ path: relativePath, content });
  };

  for (const name of ROOT_FILES) {
    const absolutePath = path.join(rootPath, name);
    if (fs.existsSync(absolutePath)) add(absolutePath);
  }

  // Symlinks are followed when they resolve to an allowed path; the visited set stops a link back to an ancestor looping.
  const visited = new Set<string>();
  const walk = (dirPath: string) => {
    const realDir = canonicalPath(dirPath);
    if (visited.has(realDir)) return;
    visited.add(realDir);
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const absolutePath = path.join(dirPath, entry.name);
      if (entry.name.startsWith(".")) continue;
      const target = entry.isSymbolicLink() ? fs.statSync(absolutePath, { throwIfNoEntry: false }) : entry;
      if (!target) continue;
      if (target.isDirectory()) {
        const relativeDir = `${toPosix(path.relative(rootPath, absolutePath))}/`;
        if (!IGNORED_DIRS.has(entry.name) && allowed(relativeDir) && landsOnAllowedPath(rootPath, absolutePath, allowed, true)) walk(absolutePath);
      } else if (target.isFile()) {
        add(absolutePath);
      }
    }
  };
  const claudeDir = path.join(rootPath, CLAUDE_DIR);
  if (fs.existsSync(claudeDir) && fs.statSync(claudeDir).isDirectory()) walk(claudeDir);

  return files.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Nested objects merge in both modes, so keys only the target has always survive.
 * In merge mode existing values win and arrays gain the template's missing entries;
 * in override mode the template's values and arrays win.
 */
export function mergeJson(existing: unknown, incoming: unknown, mode: ScaffoldMode = "merge"): unknown {
  if (isPlainObject(existing) && isPlainObject(incoming)) {
    const merged: Record<string, unknown> = { ...existing };
    for (const [key, value] of Object.entries(incoming)) {
      merged[key] = key in existing ? mergeJson(existing[key], value, mode) : value;
    }
    return merged;
  }
  if (mode === "override") return incoming;
  if (Array.isArray(existing) && Array.isArray(incoming)) {
    const seen = new Set(existing.map((item) => JSON.stringify(item)));
    return [...existing, ...incoming.filter((item) => !seen.has(JSON.stringify(item)))];
  }
  return existing;
}

function planFile(file: TemplateFile, targetPath: string, mode: ScaffoldMode, allowed: (relativePath: string) => boolean): PlannedWrite {
  const absolutePath = path.join(targetPath, file.path);
  if (!landsOnAllowedPath(targetPath, absolutePath, allowed)) return { path: file.path, action: "skip" };
  if (!fs.existsSync(absolutePath)) return { path: file.path, action: "create", content: file.content };

  const current = fs.readFileSync(absolutePath, "utf8");
  if (current === file.content) return { path: file.path, action: "unchanged" };

  // A template's settings or .mcp.json can be trimmed to the chosen plugins and
  // servers, so even override merges JSON rather than dropping the target's other keys.
  const existingJson = file.path.endsWith(".json") ? parseJsonObject(current) : null;
  const incomingJson = existingJson ? parseJsonObject(file.content) : null;
  if (!existingJson || !incomingJson) {
    return mode === "override" ? { path: file.path, action: "overwrite", content: file.content } : { path: file.path, action: "skip" };
  }

  const merged = mergeJson(existingJson, incomingJson, mode);
  if (JSON.stringify(merged) === JSON.stringify(existingJson)) return { path: file.path, action: "unchanged" };
  return { path: file.path, action: mode === "override" ? "overwrite" : "merge", content: `${JSON.stringify(merged, null, 2)}\n` };
}

function planWrites(files: TemplateFile[], targetPath: string, mode: ScaffoldMode): PlannedWrite[] {
  const allowed = pathFilter(targetPath);
  const remapClaudeMd = isUserHome(targetPath) && !files.some((file) => file.path === USER_CLAUDE_MD);
  return files
    .filter((file) => isScaffoldablePath(file.path))
    .map((file) => remapClaudeMd && file.path === "CLAUDE.md" ? { ...file, path: USER_CLAUDE_MD } : file)
    .map((file) => allowed(file.path) ? planFile(file, targetPath, mode, allowed) : { path: file.path, action: "skip" });
}

export function planScaffold(files: TemplateFile[], targetPath: string, mode: ScaffoldMode): ScaffoldPlanEntry[] {
  return planWrites(files, targetPath, mode).map(({ path: filePath, action }) => ({ path: filePath, action }));
}

const WRITING_ACTIONS: ScaffoldAction[] = ["create", "merge", "overwrite"];

export function applyScaffold(files: TemplateFile[], targetPath: string, mode: ScaffoldMode): { written: string[]; skipped: string[] } {
  if (!fs.existsSync(targetPath)) throw new Error(`${targetPath} does not exist.`);
  const written: string[] = [];
  const skipped: string[] = [];
  for (const entry of planWrites(files, targetPath, mode)) {
    if (!WRITING_ACTIONS.includes(entry.action) || entry.content === undefined) {
      if (entry.action === "skip") skipped.push(entry.path);
      continue;
    }
    const absolutePath = path.resolve(targetPath, entry.path);
    const relative = path.relative(path.resolve(targetPath), absolutePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) continue;
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, entry.content, "utf8");
    if (entry.content.startsWith("#!")) fs.chmodSync(absolutePath, 0o755);
    written.push(entry.path);
  }
  return { written, skipped };
}

export function templateExportFileName(name: string): string {
  const safe = name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "template";
  return `${safe}.devrealm-template.json`;
}

export function serializeTemplate(template: ScaffoldTemplate): string {
  const { id: _id, ...rest } = template;
  return `${JSON.stringify({ format: TEMPLATE_EXPORT_FORMAT, version: TEMPLATE_EXPORT_VERSION, template: rest }, null, 2)}\n`;
}

function parseKind(value: unknown): TemplateKind {
  if (value === "project" || value === "workspace" || value === "user") return value;
  throw new Error("The Template kind must be project, workspace or user.");
}

/** Validates anything that claims to be a template, whether imported or sent by the renderer. */
export function parseTemplateDraft(raw: unknown): TemplateDraft {
  if (!isPlainObject(raw)) throw new Error("This is not a DevRealm Template.");
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) throw new Error("The Template needs a name.");

  const files = (Array.isArray(raw.files) ? raw.files : [])
    .filter((file): file is TemplateFile => isPlainObject(file) && typeof file.path === "string" && typeof file.content === "string")
    .map((file) => ({ path: file.path.replace(/\\/g, "/"), content: file.content }))
    .filter((file) => isScaffoldablePath(file.path));

  const plugins = (Array.isArray(raw.plugins) ? raw.plugins : [])
    .filter((plugin): plugin is TemplatePlugin => isPlainObject(plugin) && typeof plugin.id === "string" && PLUGIN_ID.test(plugin.id))
    .map((plugin) => ({
      id: plugin.id,
      marketplace: typeof plugin.marketplace === "string" && MARKETPLACE_SOURCE.test(plugin.marketplace) ? plugin.marketplace : undefined,
    }));

  return {
    kind: parseKind(raw.kind),
    name,
    description: typeof raw.description === "string" && raw.description.trim() ? raw.description.trim() : undefined,
    source: typeof raw.source === "string" ? raw.source : undefined,
    files,
    plugins,
  };
}

export function parseTemplateExport(content: string): TemplateDraft {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error("The file is not valid JSON.");
  }
  if (!isPlainObject(raw) || raw.format !== TEMPLATE_EXPORT_FORMAT) throw new Error("This is not a DevRealm Template export.");
  if (raw.version !== TEMPLATE_EXPORT_VERSION) throw new Error(`Unsupported Template version ${String(raw.version)}.`);
  return parseTemplateDraft(raw.template);
}
