import fs from "fs";

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseJsonObject(content: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(content);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function readJsonObject(filePath: string): Record<string, unknown> {
  try {
    return parseJsonObject(fs.readFileSync(filePath, "utf8")) ?? {};
  } catch {
    return {};
  }
}

/** Plugins Claude Code loads from these settings, later files overriding earlier ones as settings.local.json overrides settings.json. */
export function enabledPluginIds(settings: (Record<string, unknown> | null | undefined)[]): string[] {
  const merged: Record<string, unknown> = Object.assign(
    {},
    ...settings.map((values) => (isPlainObject(values?.enabledPlugins) ? values.enabledPlugins : {})),
  );
  return Object.keys(merged).filter((id) => merged[id] === true);
}
