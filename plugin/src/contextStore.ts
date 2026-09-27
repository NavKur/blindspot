import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { describeProblems, parseContext, type Finding, type FunctionEntry, type ReadinessContext } from "./contract";
import { ContextIndex, relativeTo } from "./contextIndex";
import { getSettings, workspaceRoot } from "./settings";
import { firstExisting, resolveTargetRoot } from "./targetRoot";

/**
 * Finds, loads, validates and watches the context file. Keeps the last valid context when a
 * reload fails and shows exactly one error message per failed load.
 */
export class ContextStore implements vscode.Disposable {
  private index: ContextIndex | undefined;
  private previous: ReadinessContext | undefined;
  private targetRoot: string | undefined;
  private loadedFrom: string | undefined;
  private readonly reloadEmitter = new vscode.EventEmitter<{ previous: ReadinessContext | undefined; current: ReadinessContext }>();
  private readonly emitter = new vscode.EventEmitter<ReadinessContext | undefined>();
  private readonly disposables: vscode.Disposable[] = [];
  private watcher: vscode.FileSystemWatcher | undefined;
  private loadTimer: NodeJS.Timeout | undefined;

  readonly onDidChange = this.emitter.event;
  /** Fires after every successful load with the previous context, for "what changed" toasts. */
  readonly onDidReload = this.reloadEmitter.event;

  constructor(private readonly root: string | undefined = workspaceRoot()) {
    this.disposables.push(this.emitter, this.reloadEmitter);
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("bobReadiness.contextPath") || e.affectsConfiguration("bobReadiness.targetRoot")) {
          this.startWatching();
          void this.load();
        }
      }),
    );
    this.startWatching();
  }

  /**
   * Root of the repository the context describes: target/<repo> in the Blindspot layout, or the
   * workspace folder. Git, tests and Bob all run here.
   */
  get workspaceRoot(): string | undefined {
    return this.targetRoot ?? this.root;
  }

  /** The workspace folder itself (where settings and results live). */
  get workspaceFolder(): string | undefined {
    return this.root;
  }

  /** Absolute path of the context file that was loaded, or the first place it is looked for. */
  get contextFilePath(): string | undefined {
    if (this.loadedFrom) return this.loadedFrom;
    if (!this.root) return undefined;
    return path.join(this.root, getSettings().contextPath);
  }

  private async candidatePaths(): Promise<string[]> {
    if (!this.root) return [];
    const settings = getSettings();
    this.targetRoot = await resolveTargetRoot(this.root, settings.targetRoot);
    const rel = settings.contextPath;
    const candidates = [path.join(this.targetRoot, rel)];
    const inWorkspace = path.join(this.root, rel);
    if (inWorkspace !== candidates[0]) candidates.push(inWorkspace);
    return candidates;
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
    const root = this.workspaceRoot;
    if (!root || uri.scheme !== "file") return undefined;
    return relativeTo(root, uri.fsPath);
  }

  /** Absolute file path for a context relative path. */
  absolutePath(relPath: string): string | undefined {
    const root = this.workspaceRoot;
    if (!root) return undefined;
    return path.join(root, ...relPath.split("/"));
  }

  /**
   * The study notes named by notes_markdown_path. Looked up in the target repository first, then
   * in the workspace folder (the Blindspot layout keeps .bob/ at the root). Undefined when absent.
   */
  async readNotes(): Promise<string | undefined> {
    const ctx = this.getContext();
    if (!ctx) return undefined;
    const rel = ctx.notes_markdown_path.split("/");
    const roots = [this.workspaceRoot, this.root].filter((r): r is string => !!r);
    for (const root of [...new Set(roots)]) {
      try {
        return await fs.readFile(path.join(root, ...rel), "utf8");
      } catch {
        // try the next root
      }
    }
    return undefined;
  }

  /** Absolute path of the study notes if they exist in either root. */
  async notesPath(): Promise<string | undefined> {
    const ctx = this.getContext();
    if (!ctx) return undefined;
    const rel = ctx.notes_markdown_path.split("/");
    for (const root of [...new Set([this.workspaceRoot, this.root].filter((r): r is string => !!r))]) {
      const candidate = path.join(root, ...rel);
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        // next
      }
    }
    return undefined;
  }

  /** Load the file now. Returns true when a valid context is available afterwards. */
  async load(): Promise<boolean> {
    const candidates = await this.candidatePaths();
    if (candidates.length === 0) return false;
    const file = await firstExisting(candidates);
    let text: string;
    try {
      text = await fs.readFile(file, "utf8");
      this.loadedFrom = file;
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
    const previous = this.previous;
    this.previous = result.context;
    this.index = new ContextIndex(result.context);
    this.emitter.fire(result.context);
    this.reloadEmitter.fire({ previous, current: result.context });
    return true;
  }

  private startWatching(): void {
    this.watcher?.dispose();
    this.watcher = undefined;
    if (!this.root) return;
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) return;
    // Watch both places the file can live: the workspace folder and target/*/ (Blindspot layout).
    const rel = getSettings().contextPath;
    const schedule = () => {
      if (this.loadTimer) clearTimeout(this.loadTimer);
      this.loadTimer = setTimeout(() => void this.load(), 150);
    };
    this.watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, `{${rel},target/*/${rel}}`));
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
