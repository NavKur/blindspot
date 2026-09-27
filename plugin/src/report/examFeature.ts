import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import type { Log } from "../output";
import type { PanelExtras, PanelMessage } from "../panel/PanelProvider";
import type { HeaderFallback } from "../panel/state";
import { getSettings } from "../settings";
import { runProcess } from "../shell";
import { exists } from "../targetRoot";
import { buildExamView, compareRows, type ExamView } from "./examView";
import type { Report } from "./reportContract";
import { guessRepoName, pct } from "./reportLogic";
import { findEngineRoot, publishCommandFor } from "./resultsLocation";
import type { ReportStore } from "./reportStore";

export type { ChartLine, CompareRow, ExamModuleRow, ExamView } from "./examView";

/** The Exam tab: overview, modules, worst entities, history chart, run comparison and Publish. */
export class ExamFeature implements PanelExtras, vscode.Disposable {
  private compare: ExamView["compare"] | undefined;
  private publish: ExamView["publish"] | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly store: ReportStore,
    private readonly log: Log,
    private readonly onChange: () => void,
  ) {
    this.disposables.push(store.onDidChange(() => this.onChange()));
  }

  extraState(): { exam?: ExamView } {
    return { exam: this.view() };
  }

  /** Header numbers when there is no readiness context: accuracy and confidently wrong count. */
  headerFallback(): HeaderFallback | undefined {
    const r = this.store.getReport();
    if (!r) return undefined;
    return {
      repoName: guessRepoName(r),
      readiness: pct(r.overall.accuracy),
      readinessLabel: `accuracy, ${r.run.condition}`,
      sureButWrong: String(r.overall.cw_count),
      sureButWrongLabel: "confidently wrong",
    };
  }

  async handle(msg: PanelMessage): Promise<boolean> {
    switch (msg.type) {
      case "openTargetFile":
        await this.openTargetFile(msg.file);
        return true;
      case "compareRuns":
        await this.compareRuns(msg.a, msg.b);
        return true;
      case "publish":
        await this.runPublish();
        return true;
      case "reloadReport":
        await this.store.load();
        this.onChange();
        return true;
      default:
        return false;
    }
  }

  private async openTargetFile(rel: string): Promise<void> {
    const abs = typeof rel === "string" ? this.store.absolutePath(rel) : undefined;
    if (!abs) return;
    try {
      await fs.access(abs);
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(abs));
      await vscode.window.showTextDocument(doc, { preview: false });
    } catch {
      void vscode.window.showWarningMessage(
        `Blindspot: ${rel} is not in the workspace. Run "python cli.py target" to fetch the examined repository, or set bobReadiness.targetRoot.`,
      );
    }
  }

  private async compareRuns(a: string, b: string): Promise<void> {
    if (typeof a !== "string" || typeof b !== "string") return;
    const [ra, rb] = await Promise.all([this.store.loadRun(a), this.store.loadRun(b)]);
    if (!ra || !rb) {
      void vscode.window.showWarningMessage("Blindspot: could not read one of the run reports.");
      return;
    }
    this.compare = { a, b, rows: compareRows(ra, rb) };
    this.onChange();
  }

  /**
   * Run `python cli.py publish` in the Blindspot engine checkout. The workspace may be the engine
   * root or the examined repository inside it (target/tinydb), so the engine is looked for in the
   * workspace and its parents. The files are published into the repository the reports map onto.
   */
  private async runPublish(): Promise<void> {
    const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspace || this.publish?.running) return;
    const setting = getSettings().publishCommand.trim();
    const engineRoot = await findEngineRoot(workspace, exists);
    if (!engineRoot) {
      const output =
        `cli.py was not found in ${workspace} or its parent folders. Open the Blindspot repository, or the examined ` +
        "repository inside its target/ folder, or point bobReadiness.publishCommand at the engine.";
      this.publish = { running: false, ok: false, output, command: setting };
      this.log.line(`Publish refused: ${output}`);
      this.onChange();
      return;
    }
    const targetRoot = this.store.getInfo()?.targetRoot ?? workspace;
    const command = publishCommandFor(setting, engineRoot, targetRoot, await this.venvPython(engineRoot));
    this.publish = { running: true, output: "", command };
    this.onChange();
    this.log.show();
    this.log.line(`Publish in ${engineRoot}: ${command}`);
    const result = await runProcess(command, [], {
      cwd: engineRoot,
      shell: true,
      timeoutMs: 5 * 60 * 1000,
      onLine: (line) => this.log.line(`publish: ${line}`),
    });
    const output = `${result.stdout}\n${result.stderr}`.trim();
    const ok = result.code === 0;
    this.publish = { running: false, ok, output: output || (ok ? "Done." : `Exit code ${result.code}`), command };
    this.log.line(ok ? "Publish finished" : `Publish failed with exit code ${result.code}`);
    this.onChange();
    // The published copies under .bob/blindspot may be what the Exam tab is reading.
    if (ok) await this.store.load();
  }

  /** The engine's virtualenv interpreter, when it has one. */
  private async venvPython(engineRoot: string): Promise<string | undefined> {
    for (const candidate of [path.join(engineRoot, ".venv", "bin", "python"), path.join(engineRoot, ".venv", "Scripts", "python.exe")]) {
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        // try the next one
      }
    }
    return undefined;
  }

  private view(): ExamView | undefined {
    const report = this.store.getReport();
    const info = this.store.getInfo();
    if (!report || !info) return undefined;
    return buildExamView({
      report,
      history: this.store.getHistory(),
      source: info.source,
      resultsDir: info.resultsDir,
      runs: info.runs,
      compare: this.compare,
      publish: this.publish,
      error: this.store.error,
    });
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}

export type { Report };
