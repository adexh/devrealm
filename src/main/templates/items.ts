import type {
  TemplateContent,
  TemplateFile,
  TemplateItem,
  TemplateItemGroup,
  TemplatePlugin,
} from "../../shared/templates";
import { enabledPluginIds as enabledIn, isPlainObject, parseJsonObject } from "../claudeJson";
import { MARKETPLACE_SOURCE } from "./scaffold";

const MCP_PATH = ".mcp.json";
const LOCAL_INSTRUCTIONS_PATH = "CLAUDE.local.md";
const SETTINGS_FILES = [
  { path: ".claude/settings.json", itemId: "settings", personal: false },
  { path: ".claude/settings.local.json", itemId: "settings-local", personal: true },
];
const GROUP_ORDER: TemplateItemGroup[] = ["instructions", "plugins", "skills", "mcp", "agents", "commands", "settings", "other"];

export type KnownMarketplaces = Record<string, { source?: { repo?: string; url?: string } }>;

function objectEntries(value: unknown): [string, unknown][] {
  return isPlainObject(value) ? Object.entries(value) : [];
}

function fileContent(files: TemplateFile[], filePath: string): Record<string, unknown> | null {
  const file = files.find((item) => item.path === filePath);
  return file ? parseJsonObject(file.content) : null;
}

function skillName(filePath: string): string | null {
  const match = filePath.match(/^\.claude\/skills\/([^/]+?)(?:\.md$|\/)/);
  return match ? match[1] : null;
}

function fileItemId(filePath: string): string | null {
  if (filePath === MCP_PATH || SETTINGS_FILES.some((settings) => settings.path === filePath)) return null;
  const skill = skillName(filePath);
  return skill ? `skill:${skill}` : `file:${filePath}`;
}

function fileGroup(filePath: string): TemplateItemGroup {
  if (/^(?:\.claude\/CLAUDE|CLAUDE|AGENTS|CLAUDE\.local)\.md$/.test(filePath) || /^\.claude\/(rules|output-styles)\//.test(filePath)) return "instructions";
  if (filePath.startsWith(".claude/agents/")) return "agents";
  if (filePath.startsWith(".claude/commands/")) return "commands";
  return "other";
}

function frontmatterDescription(content: string): string | undefined {
  return content.match(/^description:\s*(.+)$/m)?.[1].trim();
}

/** A server is personal when only settings.local.json defines it, since its config can carry tokens. */
function mcpServers(files: TemplateFile[]): Map<string, { config: unknown; personal: boolean }> {
  const servers = new Map<string, { config: unknown; personal: boolean }>();
  for (const source of [{ path: MCP_PATH, personal: false }, ...SETTINGS_FILES]) {
    for (const [name, config] of objectEntries(fileContent(files, source.path)?.mcpServers)) {
      servers.set(name, { config, personal: source.personal && (servers.get(name)?.personal ?? true) });
    }
  }
  return servers;
}

function enabledPluginIds(files: TemplateFile[], settingsFiles = SETTINGS_FILES): string[] {
  return enabledIn(settingsFiles.map((settings) => fileContent(files, settings.path)));
}

function describeMcp(config: unknown): string | undefined {
  if (!isPlainObject(config)) return undefined;
  if (typeof config.url === "string") return config.url;
  const args = Array.isArray(config.args) ? config.args.join(" ") : "";
  return typeof config.command === "string" ? `${config.command} ${args}`.trim() : undefined;
}

/**
 * `userScope` is set for a capture of the home folder, where settings.json is the
 * user's own and commonly holds env tokens, so it and its MCP servers start unticked.
 */
export function describeConfig({ files, plugins }: TemplateContent, userScope = false): TemplateItem[] {
  const items = new Map<string, TemplateItem>();
  const sharedPlugins = new Set(enabledPluginIds(files, SETTINGS_FILES.filter((settings) => !settings.personal)));

  for (const file of files) {
    const id = fileItemId(file.path);
    if (!id) continue;
    const skill = skillName(file.path);
    if (skill) {
      const isEntry = /(?:\/SKILL\.md|^\.claude\/skills\/[^/]+\.md)$/.test(file.path);
      const detail = isEntry ? frontmatterDescription(file.content) : items.get(id)?.detail;
      items.set(id, { id, group: "skills", label: skill, detail });
    } else if (file.path === LOCAL_INSTRUCTIONS_PATH) {
      items.set(id, { id, group: "instructions", label: file.path, detail: "Personal instructions", personal: true });
    } else {
      items.set(id, { id, group: fileGroup(file.path), label: file.path });
    }
  }

  for (const plugin of plugins) {
    const [name, marketplace] = plugin.id.split("@");
    const personal = !sharedPlugins.has(plugin.id);
    items.set(`plugin:${plugin.id}`, {
      id: `plugin:${plugin.id}`,
      group: "plugins",
      label: name,
      detail: personal ? `@${marketplace} · enabled in settings.local.json` : `@${marketplace}`,
      personal,
    });
  }

  for (const [name, { config, personal }] of mcpServers(files)) {
    items.set(`mcp:${name}`, { id: `mcp:${name}`, group: "mcp", label: name, detail: describeMcp(config), personal: personal || userScope });
  }

  for (const settings of SETTINGS_FILES) {
    const otherKeys = Object.keys(fileContent(files, settings.path) ?? {}).filter((key) => key !== "enabledPlugins" && key !== "mcpServers");
    if (!otherKeys.length) continue;
    items.set(settings.itemId, {
      id: settings.itemId,
      group: "settings",
      label: settings.path,
      detail: settings.personal ? `${otherKeys.join(", ")} · personal overrides` : otherKeys.join(", "),
      personal: settings.personal || userScope,
    });
  }

  return [...items.values()].sort((a, b) =>
    GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || a.label.localeCompare(b.label));
}

function marketplaceSource(entry: KnownMarketplaces[string] | undefined): string | undefined {
  const source = entry?.source?.repo ?? entry?.source?.url;
  return source && MARKETPLACE_SOURCE.test(source) ? source : undefined;
}

export function capturePlugins(files: TemplateFile[], known: KnownMarketplaces): TemplatePlugin[] {
  return enabledPluginIds(files).map((id) => ({ id, marketplace: marketplaceSource(known[id.split("@")[1]]) }));
}

function pick(value: unknown, keep: (key: string) => boolean): Record<string, unknown> {
  return Object.fromEntries(objectEntries(value).filter(([key]) => keep(key)));
}

function jsonFile(filePath: string, value: Record<string, unknown>): TemplateFile[] {
  const cleaned = Object.fromEntries(
    Object.entries(value).filter(([, entry]) => !isPlainObject(entry) || Object.keys(entry).length > 0),
  );
  return Object.keys(cleaned).length ? [{ path: filePath, content: `${JSON.stringify(cleaned, null, 2)}\n` }] : [];
}

export function selectContent({ files, plugins }: TemplateContent, itemIds: string[]): TemplateContent {
  const selected = new Set(itemIds);
  const keepMcp = (name: string) => selected.has(`mcp:${name}`);
  const keepPlugin = (id: string) => selected.has(`plugin:${id}`);
  // A personal file only contributes servers and plugins nothing shared defines,
  // so picking a shared server never carries a local override's token with it.
  const servers = mcpServers(files);
  const sharedPlugins = new Set(enabledPluginIds(files, SETTINGS_FILES.filter((settings) => !settings.personal)));
  const keepPersonalMcp = (name: string) => keepMcp(name) && servers.get(name)?.personal === true;
  const keepPersonalPlugin = (id: string) => keepPlugin(id) && !sharedPlugins.has(id);

  const kept = files.filter((file) => {
    const id = fileItemId(file.path);
    return id !== null && selected.has(id);
  });

  for (const settings of SETTINGS_FILES) {
    const values = fileContent(files, settings.path);
    if (!values) continue;
    kept.push(...jsonFile(settings.path, {
      ...(selected.has(settings.itemId) ? values : {}),
      enabledPlugins: pick(values.enabledPlugins, settings.personal ? keepPersonalPlugin : keepPlugin),
      mcpServers: pick(values.mcpServers, settings.personal ? keepPersonalMcp : keepMcp),
    }));
  }

  const mcp = fileContent(files, MCP_PATH);
  if (mcp) kept.push(...jsonFile(MCP_PATH, { ...mcp, mcpServers: pick(mcp.mcpServers, keepMcp) }));

  return {
    files: kept.sort((a, b) => a.path.localeCompare(b.path)),
    plugins: plugins.filter((plugin) => keepPlugin(plugin.id)),
  };
}
