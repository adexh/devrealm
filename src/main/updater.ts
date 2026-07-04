import { app } from "electron";
import { LATEST_RELEASE_API_URL } from "./constants";
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

// Compares the running app version against the latest GitHub release tag.
// electron-updater is not usable here because install.sh builds the app
// unpacked (no app-update.yml) and unsigned; the installer is re-run to update.
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  let release: GithubRelease;
  try {
    const res = await fetch(LATEST_RELEASE_API_URL, {
      headers: { Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return { status: "error", message: `Couldn't check for updates (GitHub returned ${res.status}).` };
    }
    release = (await res.json()) as GithubRelease;
  } catch {
    return {
      status: "error",
      message: "Couldn't reach GitHub to check for updates. Check your connection and try again.",
    };
  }

  const tag = release.tag_name?.trim();
  if (!tag) {
    return { status: "error", message: "Couldn't read the latest release from GitHub." };
  }

  const currentVersion = app.getVersion();
  const latestVersion = tag.replace(/^v/i, "");

  return isNewer(parseVersion(latestVersion), parseVersion(currentVersion))
    ? { status: "available", currentVersion, latestVersion }
    : { status: "up-to-date" };
}
