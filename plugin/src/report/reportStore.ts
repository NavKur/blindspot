import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { normalizePath, relativeTo } from "../contextIndex";
import { getSettings, workspaceRoot } from "../settings";
import { parseHistory, parseReport, type DirectoryEntry, type HistoryLine, type ModuleEntry, type Report } from "./reportContract";

export interface ReportLoadInfo {
  /** Absolute folder the files were read from. */
  resultsDir: string;
  /** True when the folder is the simulated results/sim fallback. */
  usingSim: boolean;
  /** Absolute root the report paths map onto. */
  targetRoot: string;
  /** Names of report_<run>.json files available for comparison. */
  runs: string[];
  historySkipped: number;
}

/**
 * Loads results/report_latest.json, results/history.jsonl and the per-run reports, watches the
 * folder, and maps report paths onto the workspace file tree.
 *
 * Results folder: bobReadiness.resultsPath (default "results"). When it has no report but
 * results/sim does, the simulated data is used and labelled as such.
 * Target root: bobReadiness.targetRoot, or target/<repo> from target.lock.json when present,
 * or the workspace root.
 */
export class ReportStore implements vscode.Disposable {
  private report: Report | undefined;
  private history: HistoryLine[] = [];
  private info: ReportLoadInfo | undefined;
  private modulesByPath = new Map<string, ModuleEntry>();
  private dirsByPath = new Map<string, DirectoryEntry>();
  private readonly emitter = new vscode.EventEmitter<Report | undefined>();
  private readonly disposables: vscode.Disposable[] = [];
  private watchers: vscode.FileSystemWatcher[] = [];
  private timer: NodeJS.Timeout | undefined;
  private lastError: string | undefined;

  readonly onDidChange = this.emitter.event;

  constructor(private readonly root: string | undefined = workspaceRoot()) {
    this.disposables.push(this.emitter);
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("bobReadiness.resultsPath") || e.affectsConfiguration("bobReadiness.targetRoot")) {
          this.startWatching();
          void this.load();
        }
      }),
    );
    this.startWatching();
  }

  getReport(): Report | undefined {
    return this.report;
  }

  getHistory(): HistoryLine[] {
    return this.history;
  }

  getInfo(): ReportLoadInfo | undefined {
    return this.info;
  }

  get error(): string | undefined {
    return this.lastError;
  }

  moduleForPath(relPath: string): ModuleEntry | undefined {
    return this.modulesByPath.get(normalizePath(relPath));
  }

  directoryForPath(relPath: string): DirectoryEntry | undefined {
    return this.dirsByPath.get(normalizePath(relPath));
  }

  /** Report relative path for a workspace file, or undefined when outside the target root. */
  relativePath(uri: vscode.Uri): string | undefined {
    if (!this.info || uri.scheme !== "file") return undefined;
    return relativeTo(this.info.targetRoot, uri.fsPath);
  }

  /** Absolute path in the target root for a report path. */
  absolutePath(relPath: string): string | undefined {
    if (!this.info) return undefined;
    return path.join(this.info.targetRoot, ...relPath.split("/"));
  }

  /** Load one of the per-run reports by run name, e.g. "train_C1_r1". */
  async loadRun(name: string): Promise<Report | undefined> {
    if (!this.info || !/^[\w-]+$/.test(name)) return undefined;
    try {
      const text = await fs.readFile(path.join(this.info.resultsDir, `report_${name}.json`), "utf8");
      const r = parseReport(text);
      return r.ok ? r.report : undefined;
    } catch {
      return undefined;
    }
  }

  async load(): Promise<boolean> {
    if (!this.root) return false;
    const settings = getSettings();
    const primary = path.resolve(this.root, settings.resultsPath);
    let resultsDir = primary;
    let usingSim = false;
    if (!(await exists(path.join(primary, "report_latest.json")))) {
      const sim = path.join(primary, "sim");
      if (await exists(path.join(sim, "report_latest.json"))) {
        resultsDir = sim;
        usingSim = true;
      } else {
        this.clear();
        return false;
      }
    }
    const targetRoot = await this.resolveTargetRoot(settings.targetRoot);
    let text: string;
    try {
      text = await fs.readFile(path.join(resultsDir, "report_latest.json"), "utf8");
    } catch {
      this.clear();
      return false;
    }
    const parsed = parseReport(text);
    if (!parsed.ok) {
      const shown = parsed.problems.slice(0, 3).map((p) => (p.path ? `${p.path}: ${p.message}` : p.message)).join("; ");
      this.lastError = `report_latest.json is not valid: ${shown}`;
      void vscode.window.showErrorMessage(`Blindspot: ${this.lastError}`);
      this.emitter.fire(this.report);
      return this.report !== undefined;
    }
    this.lastError = undefined;
    this.report = parsed.report;
    this.modulesByPath = new Map(parsed.report.modules.map((m) => [normalizePath(m.path), m]));
    this.dirsByPath = new Map(parsed.report.directories.map((d) => [normalizePath(d.path), d]));

    let historySkipped = 0;
    try {
      const h = parseHistory(await fs.readFile(path.join(resultsDir, "history.jsonl"), "utf8"));
      this.history = h.lines;
      historySkipped = h.skipped;
    } catch {
      this.history = [];
    }
    const runs = await listRuns(resultsDir);
    this.info = { resultsDir, usingSim, targetRoot, runs, historySkipped };
    this.emitter.fire(this.report);
    return true;
  }

  private async resolveTargetRoot(setting: string): Promise<string> {
    const root = this.root!;
    if (setting.trim()) return path.resolve(root, setting.trim());
    try {
      const lock = JSON.parse(await fs.readFile(path.join(root, "target.lock.json"), "utf8")) as { repo?: string };
      const name = (lock.repo ?? "").split("/").pop()?.replace(/\.git$/, "");
      if (name) {
        const candidate = path.join(root, "target", name);
        if (await exists(candidate)) return candidate;
      }
    } catch {
      // no lock file: the workspace itself is the target
    }
    return root;
  }

  private clear(): void {
    const had = this.report !== undefined;
    this.report = undefined;
    this.history = [];
    this.info = undefined;
    this.modulesByPath.clear();
    this.dirsByPath.clear();
    if (had) this.emitter.fire(undefined);
  }

  private startWatching(): void {
    for (const w of this.watchers) w.dispose();
    this.watchers = [];
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) return;
    const base = getSettings().resultsPath.replace(/\/+$/, "");
    const schedule = () => {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.load(), 300);
    };
    for (const glob of [`${base}/report_latest.json`, `${base}/history.jsonl`, `${base}/sim/report_latest.json`, `${base}/sim/history.jsonl`]) {
      const w = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, glob));
      w.onDidChange(schedule);
      w.onDidCreate(schedule);
      w.onDidDelete(schedule);
      this.watchers.push(w);
    }
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    for (const w of this.watchers) w.dispose();
    for (const d of this.disposables) d.dispose();
  }
}

async function listRuns(resultsDir: string): Promise<string[]> {
  try {
    return (await fs.readdir(resultsDir))
      .map((f) => f.match(/^report_(.+)\.json$/)?.[1])
      .filter((n): n is string => !!n && n !== "latest")
      .sort();
  } catch {
    return [];
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
