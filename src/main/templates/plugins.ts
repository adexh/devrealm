import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import type { PluginInstallState, TemplatePlugin } from "../../shared/templates";
import type { KnownMarketplaces } from "./items";
import { isUserHome, MARKETPLACE_SOURCE, PLUGIN_ID } from "./scaffold";

const PLUGINS_DIR = path.join(os.homedir(), ".claude", "plugins");
const INSTALL_TIMEOUT_MS = 3 * 60 * 1000;

type InstalledPlugins = Record<string, { scope?: string; projectPath?: string }[]>;

function readJson<T>(fileName: string, pick: (raw: Record<string, unknown>) => unknown): T {
  try {
    return (pick(JSON.parse(fs.readFileSync(path.join(PLUGINS_DIR, fileName), "utf8"))) ?? {}) as T;
  } catch {
    return {} as T;
  }
}

export function readKnownMarketplaces(): KnownMarketplaces {
  return readJson<KnownMarketplaces>("known_marketplaces.json", (raw) => raw);
}

function isInstalledFor(installs: InstalledPlugins, id: string, targetPath: string): boolean {
  const target = path.resolve(targetPath);
  return (installs[id] ?? []).some((install) =>
    install.scope === "user" || (install.projectPath !== undefined && path.resolve(install.projectPath) === target));
}

export function planPlugins(plugins: TemplatePlugin[], targetPath: string): PluginInstallState[] {
  const installs = readJson<InstalledPlugins>("installed_plugins.json", (raw) => raw.plugins);
  return plugins.map((plugin) => ({
    id: plugin.id,
    status: isInstalledFor(installs, plugin.id, targetPath) ? "present" : "pending",
  }));
}

/**
 * A GUI-launched app has no shell PATH, and installers usually add `claude` to
 * it from .zshrc, so the CLI runs through an interactive login shell.
 * Session variables from a launching Claude Code are dropped so the CLI does not
 * think it is nested inside that session.
 */
function runClaude(args: string[], cwd: string): Promise<void> {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key === "CLAUDECODE" || key.startsWith("CLAUDE_CODE_") || key.startsWith("ELECTRON_")) delete env[key];
  }
  const [command, commandArgs] = process.platform === "win32"
    ? ["claude.cmd", args]
    : [process.env.SHELL || "/bin/zsh", ["-l", "-i", "-c", 'claude "$@"', "claude", ...args]];
  return new Promise((resolve, reject) => {
    execFile(command, commandArgs, { cwd, env, timeout: INSTALL_TIMEOUT_MS, windowsHide: true, shell: process.platform === "win32" }, (error, _stdout, stderr) => {
      if (error) reject(new Error((stderr || error.message).trim().split("\n").pop() || "claude failed"));
      else resolve();
    });
  });
}

export async function installPlugins(plugins: TemplatePlugin[], targetPath: string): Promise<PluginInstallState[]> {
  const known = readKnownMarketplaces();
  const pending = new Set(planPlugins(plugins, targetPath).filter((state) => state.status === "pending").map((state) => state.id));
  const results: PluginInstallState[] = [];
  const scope = isUserHome(targetPath) ? "user" : "project";

  for (const plugin of plugins) {
    if (!pending.has(plugin.id)) {
      results.push({ id: plugin.id, status: "present" });
      continue;
    }
    try {
      if (!PLUGIN_ID.test(plugin.id)) throw new Error("Invalid plugin id.");
      const marketplace = plugin.id.split("@")[1];
      if (!known[marketplace]) {
        if (!plugin.marketplace || !MARKETPLACE_SOURCE.test(plugin.marketplace)) {
          throw new Error(`Marketplace ${marketplace} is not added on this machine and the Template does not say where it lives.`);
        }
        await runClaude(["plugin", "marketplace", "add", plugin.marketplace], targetPath);
        known[marketplace] = { source: { repo: plugin.marketplace } };
      }
      await runClaude(["plugin", "install", plugin.id, "--scope", scope], targetPath);
      results.push({ id: plugin.id, status: "installed" });
    } catch (error) {
      results.push({ id: plugin.id, status: "failed", message: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}
