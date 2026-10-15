import { app } from "electron";
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { INSTALL_SCRIPT_URL, LATEST_RELEASE_API_URL } from "./constants";
import type { UpdateCheckResult } from "../shared/types";

type GithubRelease = { tag_name?: string; html_url?: string };

function parseVersion(raw: string): number[] {
  return raw
    .replace(/^v/i, "")
    .split(".")
    .map((part) => parseInt(part, 10) || 0);
}

// True when version `a` is strictly newer than version `b` (dotted numeric parts).
function isNewer(a: number[], b: number[]): boolean {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av > bv;
  }
  return false;
}

// Started as `electron dist/main/main.js`, Electron finds no package.json and
// app.getVersion() reports Electron's own version instead of DevRealm's.
export function appVersion(): string {
  if (app.isPackaged) return app.getVersion();
  return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "package.json"), "utf8")).version;
}

// Compares the running app version against the latest GitHub release tag.
// electron-updater is not usable here because install.sh builds the app
// unpacked (no app-update.yml) and unsigned; the installer is re-run to update.
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const currentVersion = appVersion();
  let release: GithubRelease;
  try {
    const res = await fetch(LATEST_RELEASE_API_URL, {
      headers: { Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return { status: "error", currentVersion, message: `Couldn't check for updates (GitHub returned ${res.status}).` };
    }
    release = (await res.json()) as GithubRelease;
  } catch {
    return {
      status: "error",
      currentVersion,
      message: "Couldn't reach GitHub to check for updates. Check your connection and try again.",
    };
  }

  const tag = release.tag_name?.trim();
  if (!tag) {
    return { status: "error", currentVersion, message: "Couldn't read the latest release from GitHub." };
  }

  const latestVersion = tag.replace(/^v/i, "");

  return isNewer(parseVersion(latestVersion), parseVersion(currentVersion))
    ? { status: "available", currentVersion, latestVersion }
    : { status: "up-to-date", currentVersion };
}

const UPDATE_LOG_PATH = path.join(os.homedir(), ".devrealm", "update.log");

// Runs the hosted install.sh, so even an outdated app runs the newest install
// logic. Detached so it outlives this process: once the build succeeds the
// script ends this app through DEVREALM_WAIT_PID, swaps the bundle and opens
// the new one. The promise only settles if the script exits first, which
// means the update failed and this app is still the installed one.
export function installUpdate(): Promise<{ message: string }> {
  if (process.platform === "win32") {
    return Promise.resolve({ message: "In-app updates are not available on Windows yet." });
  }
  const failed = (detail: string) => ({ message: `${detail} The full output is in ${UPDATE_LOG_PATH}.` });

  fs.mkdirSync(path.dirname(UPDATE_LOG_PATH), { recursive: true });
  const log = fs.openSync(UPDATE_LOG_PATH, "w");
  // A GUI-launched app lacks the PATH from the user's shell profile, and the
  // installer needs git and node from nvm or Homebrew.
  const userShell = process.env.SHELL || (process.platform === "darwin" ? "/bin/zsh" : "/bin/bash");
  const env: NodeJS.ProcessEnv = { ...process.env, DEVREALM_WAIT_PID: String(process.pid) };
  delete env.ELECTRON_RUN_AS_NODE;

  return new Promise((resolve) => {
    const child = spawn(userShell, ["-l", "-i", "-c", `curl -fsSL ${INSTALL_SCRIPT_URL} | bash`], {
      env,
      cwd: os.homedir(),
      detached: true,
      stdio: ["ignore", log, log],
    });
    fs.closeSync(log);
    child.once("error", (error) => resolve(failed(`Couldn't start the installer: ${error.message}.`)));
    child.once("exit", (code) => resolve(code === 0
      ? { message: "The update finished but DevRealm wasn't restarted. Quit and reopen DevRealm to use the new version." }
      : failed(`The installer stopped with exit code ${code ?? "unknown"}.`)));
  });
}
