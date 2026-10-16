import { execFile } from "child_process";
import os from "os";
import path from "path";
import type { PluginInstallState, TemplatePlugin } from "../../shared/templates";
import { readJsonObject } from "../claudeJson";
import { loginShellCommand } from "../loginShell";
import type { KnownMarketplaces } from "./items";
import { isUserHome, MARKETPLACE_SOURCE, PLUGIN_ID } from "./scaffold";

const PLUGINS_DIR = path.join(os.homedir(), ".claude", "plugins");
const INSTALL_TIMEOUT_MS = 3 * 60 * 1000;

type InstalledPlugins = Record<string, { scope?: string; projectPath?: string }[]>;

export function readKnownMarketplaces(): KnownMarketplaces {
  return readJsonObject(path.join(PLUGINS_DIR, "known_marketplaces.json")) as KnownMarketplaces;
}

function isInstalledFor(installs: InstalledPlugins, id: string, targetPath: string): boolean {
  const target = path.resolve(targetPath);
  return (installs[id] ?? []).some((install) =>
    install.scope === "user" || (install.projectPath !== undefined && path.resolve(install.projectPath) === target));
}

export function planPlugins(plugins: TemplatePlugin[], targetPath: string): PluginInstallState[] {
  const installs = (readJsonObject(path.join(PLUGINS_DIR, "installed_plugins.json")).plugins ?? {}) as InstalledPlugins;
  return plugins.map((plugin) => ({
    id: plugin.id,
    status: isInstalledFor(installs, plugin.id, targetPath) ? "present" : "pending",
  }));
}

// Every argument is a fixed word or a plugin id or marketplace source that
// already passed PLUGIN_ID or MARKETPLACE_SOURCE, so it is safe in a shell string.
const SHELL_SAFE_ARG = /^[\w.\/:@-]+$/;

/**
 * Runs the CLI through the user's login shell, which is where `claude` is on
 * PATH. Session variables from a launching Claude Code are dropped so the CLI
 * does not think it is nested inside that session.
 */
function runClaude(args: string[], cwd: string): Promise<void> {
  if (!args.every((arg) => SHELL_SAFE_ARG.test(arg))) return Promise.reject(new Error("Refusing an unsafe claude argument."));
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key === "CLAUDECODE" || key.startsWith("CLAUDE_CODE_") || key.startsWith("ELECTRON_")) delete env[key];
  }
  const [command, commandArgs] = process.platform === "win32"
    ? ["claude.cmd", args]
    : loginShellCommand(["claude", ...args].join(" "));
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
