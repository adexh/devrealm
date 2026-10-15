import fs from "fs";
import { dialog, ipcMain } from "electron";
import type {
  SaveTemplateRequest,
  ScaffoldPlan,
  ScaffoldRequest,
  ScaffoldResult,
  ScaffoldTemplate,
  TemplateContent,
  TemplateItem,
  TemplateSummary,
} from "../../shared/templates";
import { capturePlugins, describeConfig, selectContent } from "./items";
import { deleteTemplate, getTemplate, listTemplates, saveTemplate } from "./library";
import { installPlugins, planPlugins, readKnownMarketplaces } from "./plugins";
import {
  applyScaffold,
  captureFiles,
  parseTemplateExport,
  planScaffold,
  serializeTemplate,
  templateExportFileName,
} from "./scaffold";

function captureContent(sourcePath: string): TemplateContent {
  const files = captureFiles(sourcePath);
  return { files, plugins: capturePlugins(files, readKnownMarketplaces()) };
}

function summarize(template: ScaffoldTemplate): TemplateSummary {
  return { ...template, items: describeConfig(template) };
}

export function registerTemplateIpcHandlers(): void {
  ipcMain.handle("templates:list", (): TemplateSummary[] => listTemplates().map(summarize));

  ipcMain.handle("templates:capture", (_, sourcePath: string): TemplateItem[] => describeConfig(captureContent(sourcePath)));

  ipcMain.handle("templates:save", (_, request: SaveTemplateRequest): TemplateSummary => {
    const content = selectContent(captureContent(request.sourcePath), request.itemIds);
    return summarize(saveTemplate({
      kind: request.kind,
      name: request.name,
      description: request.description,
      source: request.source,
      ...content,
    }));
  });

  ipcMain.handle("templates:delete", (_, id: string) => deleteTemplate(id));

  ipcMain.handle("templates:plan", (_, { templateId, targetPath, mode }: ScaffoldRequest): ScaffoldPlan => {
    const template = getTemplate(templateId);
    return {
      files: planScaffold(template.files, targetPath, mode),
      plugins: planPlugins(template.plugins, targetPath),
    };
  });

  ipcMain.handle("templates:apply", async (_, { templateId, targetPath, mode }: ScaffoldRequest): Promise<ScaffoldResult> => {
    const template = getTemplate(templateId);
    const { written, skipped } = applyScaffold(template.files, targetPath, mode);
    return { written, skipped, plugins: await installPlugins(template.plugins, targetPath) };
  });

  ipcMain.handle("templates:export", async (_, id: string): Promise<string | null> => {
    const template = getTemplate(id);
    const result = await dialog.showSaveDialog({
      title: "Export Template",
      defaultPath: templateExportFileName(template.name),
      filters: [{ name: "DevRealm Template", extensions: ["json"] }],
    });
    if (result.canceled || !result.filePath) return null;
    fs.writeFileSync(result.filePath, serializeTemplate(template), "utf8");
    return result.filePath;
  });

  ipcMain.handle("templates:import", async (): Promise<TemplateSummary | null> => {
    const result = await dialog.showOpenDialog({
      title: "Import Template",
      properties: ["openFile"],
      filters: [{ name: "DevRealm Template", extensions: ["json"] }],
    });
    const filePath = result.filePaths[0];
    if (result.canceled || !filePath) return null;
    return summarize(saveTemplate(parseTemplateExport(fs.readFileSync(filePath, "utf8"))));
  });
}
