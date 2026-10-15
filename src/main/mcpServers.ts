import fs from "fs";
import os from "os";
import path from "path";
import type { McpServer, McpServerScope } from "../shared/types";

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJson(filePath: string): JsonObject {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function toServers(raw: unknown, scope: McpServerScope, prefix = ""): McpServer[] {
  if (!isObject(raw)) return [];
  return Object.entries(raw).map(([name, config]) => {
    const c = isObject(config) ? config : {};
    const url = typeof c.url === "string" ? c.url : undefined;
    const args = Array.isArray(c.args) ? c.args : [];
    return {
      name: `${prefix}${name}`,
      type: typeof c.type === "string" ? c.type : url ? "http" : "stdio",
      command: url ?? [c.command, ...args].filter(Boolean).join(" "),
      scope,
    };
  });
}

function enabledPluginIds(settingsDirs: string[]): string[] {
  const merged: JsonObject = Object.assign({}, ...settingsDirs.flatMap((dir) => ["settings.json", "settings.local.json"].map((file) => {
    const enabled = readJson(path.join(dir, file)).enabledPlugins;
    return isObject(enabled) ? enabled : {};
  })));
  return Object.keys(merged).filter((id) => merged[id] === true);
}

function pluginServers(settingsDirs: string[], home: string): McpServer[] {
  const installed = readJson(path.join(home, ".claude", "plugins", "installed_plugins.json")).plugins;
  return enabledPluginIds(settingsDirs).flatMap((id) => {
    const installs = isObject(installed) ? installed[id] : undefined;
    const installPath = Array.isArray(installs) && isObject(installs[0]) ? installs[0].installPath : undefined;
    if (typeof installPath !== "string") return [];
    const mcp = readJson(path.join(installPath, ".mcp.json"));
    const raw = mcp.mcpServers ?? (Object.keys(mcp).length ? mcp : readJson(path.join(installPath, ".claude-plugin", "plugin.json")).mcpServers);
    return toServers(raw, "plugin", `plugin:${id.split("@")[0]}:`);
  });
}

export function listMcpServers(rootPath: string): McpServer[] {
  const home = os.homedir();
  const root = path.resolve(rootPath);
  const claudeJson = readJson(path.join(home, ".claude.json"));
  const projects = isObject(claudeJson.projects) ? claudeJson.projects : {};
  const local = isObject(projects[root]) ? projects[root].mcpServers : undefined;
  return [
    ...toServers(local, "local"),
    ...toServers(readJson(path.join(root, ".mcp.json")).mcpServers, "project"),
    ...toServers(claudeJson.mcpServers, "user"),
    ...pluginServers([path.join(home, ".claude"), path.join(root, ".claude")], home),
  ];
}
