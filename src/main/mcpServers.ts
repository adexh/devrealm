import os from "os";
import path from "path";
import type { McpServer, McpServerScope } from "../shared/types";
import { enabledPluginIds, isPlainObject, readJsonObject } from "./claudeJson";

function toServers(raw: unknown, scope: McpServerScope, prefix = ""): McpServer[] {
  if (!isPlainObject(raw)) return [];
  return Object.entries(raw).map(([name, config]) => {
    const c = isPlainObject(config) ? config : {};
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

function pluginServers(settingsDirs: string[], home: string): McpServer[] {
  const installed = readJsonObject(path.join(home, ".claude", "plugins", "installed_plugins.json")).plugins;
  const settings = settingsDirs.flatMap((dir) => ["settings.json", "settings.local.json"].map((file) => readJsonObject(path.join(dir, file))));
  return enabledPluginIds(settings).flatMap((id) => {
    const installs = isPlainObject(installed) ? installed[id] : undefined;
    const installPath = Array.isArray(installs) && isPlainObject(installs[0]) ? installs[0].installPath : undefined;
    if (typeof installPath !== "string") return [];
    const mcp = readJsonObject(path.join(installPath, ".mcp.json"));
    const raw = mcp.mcpServers ?? (Object.keys(mcp).length ? mcp : readJsonObject(path.join(installPath, ".claude-plugin", "plugin.json")).mcpServers);
    return toServers(raw, "plugin", `plugin:${id.split("@")[0]}:`);
  });
}

export function listMcpServers(rootPath: string): McpServer[] {
  const home = os.homedir();
  const root = path.resolve(rootPath);
  const claudeJson = readJsonObject(path.join(home, ".claude.json"));
  const projects = isPlainObject(claudeJson.projects) ? claudeJson.projects : {};
  const local = isPlainObject(projects[root]) ? projects[root].mcpServers : undefined;
  return [
    ...toServers(local, "local"),
    ...toServers(readJsonObject(path.join(root, ".mcp.json")).mcpServers, "project"),
    ...toServers(claudeJson.mcpServers, "user"),
    ...pluginServers([path.join(home, ".claude"), path.join(root, ".claude")], home),
  ];
}
