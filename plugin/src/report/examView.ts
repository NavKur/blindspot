import type { HistoryLine, ModuleEntry, Report, WorstEntity } from "./reportContract";
import {
  alignSeries,
  compareReports,
  fileSparkline,
  formatWhen,
  heatBucket,
  historySeries,
  modulesWorstFirst,
  pct,
  polylinePoints,
  timeAxis,
  type ModuleDelta,
} from "./reportLogic";
import type { ResultsSource } from "./resultsLocation";

/** What the Exam tab renders. Plain JSON, no VS Code dependency, so the web demo can reuse it. */
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

export const CHART_W = 260;
export const CHART_H = 60;

export interface ExamViewInputs {
  report: Report;
  history: HistoryLine[];
  source: ResultsSource;
  resultsDir: string;
  runs: string[];
  compare?: ExamView["compare"];
  publish?: ExamView["publish"];
  error?: string;
}

/** Build the Exam tab state from a report, its history and where it was read from. Pure. */
export function buildExamView(i: ExamViewInputs): ExamView {
  const { report, history } = i;
  const o = report.overall;
  const accSeries = historySeries(history, "accuracy");
  const cwSeries = historySeries(history, "cw_rate");
  const axis = timeAxis([...accSeries, ...cwSeries]);
  const toLines = (series: ReturnType<typeof historySeries>): ChartLine[] =>
    series.map((s) => ({ condition: s.condition, points: polylinePoints(alignSeries(s, axis), CHART_W, CHART_H) }));
  return {
    simulated: report.simulated,
    usingSim: i.source === "sim",
    source: i.source,
    resultsDir: i.resultsDir,
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
    runs: i.runs,
    compare: i.compare,
    publish: i.publish,
    error: i.error,
  };
}

/** Rows for the Compare runs table. */
export function compareRows(a: Report, b: Report): CompareRow[] {
  return compareReports(a, b).map(toCompareRow);
}

export function toModuleRow(m: ModuleEntry, history: HistoryLine[]): ExamModuleRow {
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

export function toCompareRow(d: ModuleDelta): CompareRow {
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
