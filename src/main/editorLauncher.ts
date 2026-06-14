import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import * as store from "./store";
import type { CodeEditorConfig, CodeEditorId } from "../shared/types";

type EditorCommand = {
  command: string;
  args: string[];
};

function resolveEditorCommand(
  editor: CodeEditorConfig,
  targetPath: string,
): EditorCommand {
  if (process.platform === "darwin") {
    if (editor.macAppName) {
      return { command: "open", args: ["-a", editor.macAppName, targetPath] };
    }
    if (editor.macCommand) {
      return { command: editor.macCommand, args: [targetPath] };
    }
  }

  if (process.platform === "win32") {
    if (editor.windowsExecutablePaths) {
      const candidates = editor.windowsExecutablePaths.map((candidate) => {
        if ("absolutePath" in candidate) return candidate.absolutePath ?? "";
        return path.join(
          process.env[candidate.env] ?? "",
          ...candidate.segments,
        );
      });
      const exePath = candidates.find((candidate) => fs.existsSync(candidate));
      if (exePath) {
        return { command: exePath, args: [targetPath] };
      }
    }
    if (editor.windowsCommand) {
      return { command: editor.windowsCommand, args: [targetPath] };
    }
    throw new Error(
      `${editor.label} not found. Install it from ${editor.installUrl}`,
    );
  }

  return { command: editor.linuxCommand, args: [targetPath] };
}

export function openInCodeEditor(
  targetPath: string,
  editorId?: CodeEditorId,
): Promise<void> {
  if (!targetPath) {
    return Promise.reject(new Error("Path is required before opening an editor."));
  }

  const settings = store.getEditorSettings();
  const resolvedEditorId = editorId ?? settings.defaultEditorId;
  const editor = settings.editors.find((item) => item.id === resolvedEditorId);
  if (!editor) {
    return Promise.reject(
      new Error(`Editor "${resolvedEditorId}" is not configured.`),
    );
  }

  let command: EditorCommand;
  try {
    command = resolveEditorCommand(editor, targetPath);
  } catch (error) {
    return Promise.reject(error);
  }

  return new Promise((resolve, reject) => {
    execFile(command.command, command.args, (err) => {
      if (err) {
        reject(new Error(`Failed to open ${editor.label}: ${err.message}`));
        return;
      }
      resolve();
    });
  });
}
