import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { describeProblems, parseContext, type Finding, type FunctionEntry, type ReadinessContext } from "./contract";
import { ContextIndex, relativeTo } from "./contextIndex";
import { getSettings, workspaceRoot } from "./settings";

/**
 * Finds, loads, validates and watches the context file. Keeps the last valid context when a
 * reload fails and shows exactly one error message per failed load.
 */
export class ContextStore implements vscode.Disposable {
  private index: ContextIndex | undefined;
  private readonly emitter = new vscode.EventEmitter<ReadinessContext | undefined>();
  private readonly disposables: vscode.Disposable[] = [];
  private watcher: vscode.FileSystemWatcher | undefined;
  private loadTimer: NodeJS.Timeout | undefined;

  readonly onDidChange = this.emitter.event;

  constructor(private readonly root: string | undefined = workspaceRoot()) {
    this.disposables.push(this.emitter);
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("bobReadiness.contextPath")) {
          this.startWatching();
          void this.load();
        }
      }),
    );
    this.startWatching();
  }

  get workspaceRoot(): string | undefined {
    return this.root;
  }

  /** Absolute path of the context file, or undefined when no workspace folder is open. */
  get contextFilePath(): string | undefined {
    if (!this.root) return undefined;
    return path.join(this.root, getSettings().contextPath);
  }

  getContext(): ReadinessContext | undefined {
    return this.index?.context;
  }

  getIndex(): ContextIndex | undefined {
    return this.index;
  }

  functionsForFile(relPath: string): FunctionEntry[] {
    return this.index?.functionsForFile(relPath) ?? [];
  }

  findingsForFile(relPath: string): Finding[] {
    return this.index?.findingsForFile(relPath) ?? [];
  }

  findingById(id: string): Finding | undefined {
    return this.index?.findingById(id);
  }

  functionById(id: string): FunctionEntry | undefined {
    return this.index?.functionById(id);
  }

  /** Workspace relative path (forward slashes) for a document, or undefined if outside the root. */
  relativePath(uri: vscode.Uri): string | undefined {
    if (!this.root || uri.scheme !== "file") return undefined;
    return relativeTo(this.root, uri.fsPath);
  }

  /** Absolute file path for a context relative path. */
  absolutePath(relPath: string): string | undefined {
    if (!this.root) return undefined;
    return path.join(this.root, ...relPath.split("/"));
  }

  /** Load the file now. Returns true when a valid context is available afterwards. */
  async load(): Promise<boolean> {
    const file = this.contextFilePath;
    if (!file) return false;
    let text: string;
    try {
      text = await fs.readFile(file, "utf8");
    } catch {
      // Missing file is not an error worth a popup: the workspace may simply have no context yet.
      if (this.index) {
        this.index = undefined;
        this.emitter.fire(undefined);
      }
      return false;
    }
    const result = parseContext(text);
    if (!result.ok) {
      void vscode.window.showErrorMessage(
        `Bob Readiness: the context file is not valid. ${describeProblems(result.problems)}`,
      );
      return this.index !== undefined;
    }
    this.index = new ContextIndex(result.context);
    this.emitter.fire(result.context);
    return true;
  }

  private startWatching(): void {
    this.watcher?.dispose();
    this.watcher = undefined;
    if (!this.root) return;
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) return;
    const pattern = new vscode.RelativePattern(folder, getSettings().contextPath);
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
    const schedule = () => {
      if (this.loadTimer) clearTimeout(this.loadTimer);
      this.loadTimer = setTimeout(() => void this.load(), 150);
    };
    this.watcher.onDidChange(schedule);
    this.watcher.onDidCreate(schedule);
    this.watcher.onDidDelete(schedule);
  }

  dispose(): void {
    if (this.loadTimer) clearTimeout(this.loadTimer);
    this.watcher?.dispose();
    for (const d of this.disposables) d.dispose();
  }
}
