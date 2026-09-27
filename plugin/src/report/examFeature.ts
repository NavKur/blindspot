import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import type { Log } from "../output";
import type { PanelExtras, PanelMessage } from "../panel/PanelProvider";
import type { HeaderFallback } from "../panel/state";
import { getSettings } from "../settings";
import { runProcess } from "../shell";
import type { ModuleEntry, Report, WorstEntity } from "./reportContract";
import { findEngineRoot, publishCommandFor, type ResultsSource } from "./resultsLocation";
import { exists } from "../targetRoot";
import {
  alignSeries,
  compareReports,
  fileSparkline,
  formatWhen,
  guessRepoName,
  heatBucket,
  historySeries,
  modulesWorstFirst,
  pct,
  polylinePoints,
  timeAxis,
  type ModuleDelta,
} from "./reportLogic";
import type { ReportStore } from "./reportStore";

/** What the Exam tab renders. Plain JSON. */
export interface ExamView {
  simulated: boolean;
  usingSim: boolean;
  /** results (engine folder), sim (results/sim) or published (.bob/blindspot in the examined repo). */
  source: ResultsSource;
  resultsDir: string;
  run: { name: string; set: string; condition: string; repeat: number };
  generatedAt: string;
  targetCommit: string;
  counts: { answers: number; scored: number; excluded: number };
  thresholds: { confident_p: number; red_acc_lower: number; red_cw_rate: number };
  overall: {
    accuracy: string;
    interval: string;
    cw: string;
    cwCount: number;
    brier: string;
    ece: string;
    overconfidence: string;
    meanP: string;
  };
  reliability: { label: string; n: number; accuracy: number | null; meanP: number | null }[];
  modules: ExamModuleRow[];
  redModules: string[];
  targetedModules: string[];
  worst: (WorstEntity & { accuracyLabel: string })[];
  history: { axis: string[]; accuracy: ChartLine[]; cw: ChartLine[]; width: number; height: number };
  runs: string[];
  compare?: { a: string; b: string; rows: CompareRow[] };
  publish?: { running: boolean; ok?: boolean; output: string; command: string };
  error?: string;
}

export interface ExamModuleRow {
  module: string;
  path: string;
  label: string;
  red: boolean;
  redReasons: string[];
  lowN: boolean;
  heat: number;
  bucket: number;
  accuracy: string;
  interval: string;
  cw: string;
  n: number;
  overconfidence: string;
  families: { name: string; accuracy: string }[];
  spark: string;
}

export interface ChartLine {
  condition: string;
  points: string;
}

export interface CompareRow {
  path: string;
  label: string;
  a: string;
  b: string;
  delta: string;
  deltaValue: number;
  cwA: string;
  cwB: string;
  redA: boolean;
  redB: boolean;
}

const CHART_W = 260;
const CHART_H = 60;

/** The Exam tab: overview, modules, worst entities, history chart, run comparison and Publish. */
export class ExamFeature implements PanelExtras, vscode.Disposable {
  private compare: { a: string; b: string; rows: CompareRow[] } | undefined;
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
    this.compare = { a, b, rows: compareReports(ra, rb).map(toCompareRow) };
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
    const history = this.store.getHistory();
    const o = report.overall;
    const accSeries = historySeries(history, "accuracy");
    const cwSeries = historySeries(history, "cw_rate");
    const axis = timeAxis([...accSeries, ...cwSeries]);
    const toLines = (series: ReturnType<typeof historySeries>): ChartLine[] =>
      series.map((s) => ({ condition: s.condition, points: polylinePoints(alignSeries(s, axis), CHART_W, CHART_H) }));
    return {
      simulated: report.simulated,
      usingSim: info.usingSim,
      source: info.source,
      resultsDir: info.resultsDir,
      run: report.run,
      generatedAt: formatWhen(report.generated_at),
      targetCommit: (report.target_commit ?? "unknown").slice(0, 7),
      counts: report.counts,
      thresholds: report.thresholds,
      overall: {
        accuracy: pct(o.accuracy),
        interval: `${pct(o.ci_low)} to ${pct(o.ci_high)}`,
        cw: pct(o.cw_rate),
        cwCount: o.cw_count,
        brier: o.brier.toFixed(3),
        ece: o.ece.toFixed(3),
        overconfidence: `${o.overconfidence >= 0 ? "+" : ""}${pct(o.overconfidence)}`,
        meanP: pct(o.mean_p),
      },
      reliability: o.reliability.map((b) => ({ label: `${pct(b.lo)} to ${pct(b.hi)}`, n: b.n, accuracy: b.accuracy, meanP: b.mean_p })),
      modules: modulesWorstFirst(report.modules).map((m) => toModuleRow(m, history)),
      redModules: report.red_modules,
      targetedModules: report.targeted_modules ?? [],
      worst: report.worst_entities.map((w) => ({ ...w, accuracyLabel: pct(w.accuracy) })),
      history: { axis: axis.map(formatWhen), accuracy: toLines(accSeries), cw: toLines(cwSeries), width: CHART_W, height: CHART_H },
      runs: info.runs,
      compare: this.compare,
      publish: this.publish,
      error: this.store.error,
    };
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}

function toModuleRow(m: ModuleEntry, history: Parameters<typeof fileSparkline>[0]): ExamModuleRow {
  return {
    module: m.module,
    path: m.path,
    label: m.path.split("/").pop() ?? m.path,
    red: m.red,
    redReasons: m.red_reasons,
    lowN: m.low_n,
    heat: m.heat,
    bucket: heatBucket(m.heat),
    accuracy: pct(m.accuracy),
    interval: `${pct(m.ci_low)} to ${pct(m.ci_high)}`,
    cw: pct(m.cw_rate),
    n: m.n,
    overconfidence: `${m.overconfidence >= 0 ? "+" : ""}${pct(m.overconfidence)}`,
    families: Object.entries(m.by_family).map(([name, accuracy]) => ({ name, accuracy: pct(accuracy) })),
    spark: polylinePoints(fileSparkline(history, m.path), 60, 16),
  };
}

function toCompareRow(d: ModuleDelta): CompareRow {
  const fmt = (v: number | undefined) => (v === undefined ? "none" : pct(v));
  const delta = d.accuracyDelta;
  return {
    path: d.path,
    label: d.path.split("/").pop() ?? d.path,
    a: fmt(d.accuracyA),
    b: fmt(d.accuracyB),
    delta: delta === undefined ? "" : `${delta >= 0 ? "+" : ""}${Math.round(delta * 100)} pts`,
    deltaValue: delta ?? 0,
    cwA: fmt(d.cwA),
    cwB: fmt(d.cwB),
    redA: d.redA === true,
    redB: d.redB === true,
  };
}

export type { Report };
