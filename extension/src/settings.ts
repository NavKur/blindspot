import * as vscode from "vscode";

/** Typed access to every bobReadiness.* setting. Defaults mirror package.json. */
export interface Settings {
  contextPath: string;
  highlightOnStartup: boolean;
  bobCommand: string;
  useFakeBob: boolean;
  testCommand: string;
  baseBranch: string;
}

export function getSettings(): Settings {
  const cfg = vscode.workspace.getConfiguration("bobReadiness");
  return {
    contextPath: cfg.get<string>("contextPath", ".bob/context/readiness.json"),
    highlightOnStartup: cfg.get<boolean>("highlightOnStartup", true),
    bobCommand: cfg.get<string>("bobCommand", "bob run --format json"),
    useFakeBob: cfg.get<boolean>("useFakeBob", true),
    testCommand: cfg.get<string>("testCommand", "pytest -q"),
    baseBranch: cfg.get<string>("baseBranch", "main"),
  };
}

/** The first workspace folder's file system path, or undefined when no folder is open. */
export function workspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
