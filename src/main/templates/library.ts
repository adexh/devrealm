import fs from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { DATA_DIR_NAME } from "../constants";
import type { ScaffoldTemplate, TemplateDraft } from "../../shared/templates";
import { parseTemplateDraft } from "./scaffold";

const TEMPLATES_DIR = path.join(os.homedir(), DATA_DIR_NAME, "templates");

function templatePath(id: string): string {
  if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error("Invalid Template id.");
  return path.join(TEMPLATES_DIR, `${id}.json`);
}

function readTemplateFile(filePath: string): ScaffoldTemplate | null {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const draft = parseTemplateDraft(raw);
    return {
      ...draft,
      id: path.basename(filePath, ".json"),
      createdAt: typeof raw.createdAt === "number" ? raw.createdAt : 0,
      updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : 0,
    };
  } catch {
    return null;
  }
}

export function listTemplates(): ScaffoldTemplate[] {
  if (!fs.existsSync(TEMPLATES_DIR)) return [];
  return fs.readdirSync(TEMPLATES_DIR)
    .filter((name) => name.endsWith(".json"))
    .map((name) => readTemplateFile(path.join(TEMPLATES_DIR, name)))
    .filter((template): template is ScaffoldTemplate => template !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getTemplate(id: string): ScaffoldTemplate {
  const template = readTemplateFile(templatePath(id));
  if (!template) throw new Error("Template not found.");
  return template;
}

/** Writes through a temp file so a crash mid-write cannot leave a truncated template. */
export function saveTemplate(draft: TemplateDraft, id?: string): ScaffoldTemplate {
  const parsed = parseTemplateDraft(draft);
  const now = Date.now();
  const existing = id ? getTemplate(id) : null;
  const template: ScaffoldTemplate = {
    ...parsed,
    id: existing?.id ?? randomUUID(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
  const target = templatePath(template.id);
  const temp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(template, null, 2), "utf8");
  fs.renameSync(temp, target);
  return template;
}

export function deleteTemplate(id: string): void {
  fs.rmSync(templatePath(id), { force: true });
}
