import type { FunctionStatus } from "./contract";
import { percent, statusLabel } from "./contract";
import type { ContextIndex } from "./contextIndex";
import type { HistoryLine, Report } from "./report/reportContract";
import { formatWhen, heatBucket, pct } from "./report/reportLogic";

/**
 * GitHub style heatmap of Bob's understanding. Two grids:
 * - files over runs: one row per file, one column per report in history, cell colour by heat;
 * - functions by file: one row per file from the readiness context, one square per function,
 *   colour by readiness. Squares with a red outline are "sure but wrong".
 * Pure: the webview only draws what is here.
 */
export interface HeatCell {
  bucket: number; // 0 fine to 4 worst
  tooltip: string;
  red: boolean;
  /** Value in [0, 1] the colour comes from (heat or 1 minus readiness). */
  value: number;
}

export interface RunColumn {
  run: string;
  condition: string;
  when: string;
}

export interface FileRunRow {
  path: string;
  label: string;
  cells: (HeatCell | null)[];
  /** Latest heat, for ordering. */
  latest: number;
}

export interface FunctionCell extends HeatCell {
  name: string;
  line: number;
  status: FunctionStatus;
  readiness: number;
  findings: number;
}

export interface FunctionRow {
  path: string;
  label: string;
  fileReadiness?: string;
  cells: FunctionCell[];
  /** Lowest readiness in the file, for ordering. */
  worst: number;
}

export interface HeatmapView {
  runs: { columns: RunColumn[]; rows: FileRunRow[] };
  functions: { rows: FunctionRow[]; total: number; wrong: number; part: number; ok: number };
  legend: string[];
}

export function buildHeatmap(history: HistoryLine[], latest: Report | undefined, index: ContextIndex | undefined): HeatmapView {
  return {
    runs: runsGrid(history, latest),
    functions: functionsGrid(index),
    legend: ["Bob knows it", "Mostly known", "Shaky", "Weak", "Sure but wrong or unknown"],
  };
}

/** One column per history line (time order), one row per file that appears in any of them. */
export function runsGrid(history: HistoryLine[], latest: Report | undefined): HeatmapView["runs"] {
  const lines = [...history].sort((a, b) => a.generated_at.localeCompare(b.generated_at));
  // Make sure the newest report is represented even when history.jsonl lags behind it.
  if (latest && !lines.some((l) => l.run === latest.run.name)) {
    lines.push({
      generated_at: latest.generated_at,
      simulated: latest.simulated,
      target_commit: latest.target_commit ?? null,
      run: latest.run.name,
      set: latest.run.set,
      condition: latest.run.condition,
      repeat: latest.run.repeat,
      accuracy: latest.overall.accuracy,
      brier: latest.overall.brier,
      cw_rate: latest.overall.cw_rate,
      n: latest.overall.n,
      modules: Object.fromEntries(latest.modules.map((m) => [m.path, { accuracy: m.accuracy, cw_rate: m.cw_rate, heat: m.heat, red: m.red }])),
    });
  }
  const columns: RunColumn[] = lines.map((l) => ({ run: l.run, condition: l.condition, when: formatWhen(l.generated_at) }));
  const paths = new Set<string>();
  for (const l of lines) for (const p of Object.keys(l.modules)) paths.add(p);
  const rows: FileRunRow[] = [...paths].map((path) => {
    const cells = lines.map((l) => {
      const m = l.modules[path];
      if (!m) return null;
      return {
        bucket: heatBucket(m.heat),
        value: m.heat,
        red: m.red,
        tooltip: `${path} in ${l.run}: accuracy ${pct(m.accuracy)}, confidently wrong ${pct(m.cw_rate)}, heat ${m.heat.toFixed(2)}${m.red ? ", red" : ""}`,
      } satisfies HeatCell;
    });
    const last = [...cells].reverse().find((c) => c !== null);
    return { path, label: path.split("/").pop() ?? path, cells, latest: last?.value ?? -1 };
  });
  rows.sort((a, b) => b.latest - a.latest || a.path.localeCompare(b.path));
  return { columns, rows };
}

/** One row per file in the readiness context, one square per function, worst files first. */
export function functionsGrid(index: ContextIndex | undefined): HeatmapView["functions"] {
  if (!index) return { rows: [], total: 0, wrong: 0, part: 0, ok: 0 };
  const files = new Map(index.context.files.map((f) => [f.path, f]));
  const rows: FunctionRow[] = [];
  let wrong = 0;
  let part = 0;
  let ok = 0;
  for (const path of index.knownFiles()) {
    const fns = [...index.functionsForFile(path)].sort((a, b) => a.line_start - b.line_start);
    if (fns.length === 0) continue;
    const cells: FunctionCell[] = fns.map((fn) => {
      if (fn.status === "wrong") wrong++;
      else if (fn.status === "part") part++;
      else ok++;
      const findings = index.findingsForFunction(fn.id).length;
      const m = fn.misconceptions[0];
      return {
        name: fn.name,
        line: fn.line_start,
        status: fn.status,
        readiness: fn.readiness,
        findings,
        red: fn.status === "wrong",
        value: 1 - fn.readiness,
        bucket: readinessBucket(fn.readiness, fn.status),
        tooltip:
          `${fn.name} (line ${fn.line_start}): readiness ${percent(fn.readiness)}, ${statusLabel(fn.status)}` +
          `${fn.tested ? ", tested" : ", not tested"}${findings ? `, ${findings} finding${findings === 1 ? "" : "s"}` : ""}` +
          (m ? `. Bob believed ${m.believed}. Actually: ${m.truth}.` : ""),
      };
    });
    const file = files.get(path);
    rows.push({
      path,
      label: path.split("/").pop() ?? path,
      fileReadiness: file ? percent(file.readiness) : undefined,
      cells,
      worst: Math.min(...fns.map((f) => f.readiness)),
    });
  }
  rows.sort((a, b) => a.worst - b.worst || a.path.localeCompare(b.path));
  return { rows, total: wrong + part + ok, wrong, part, ok };
}

/** Readiness to a 0..4 bucket. "wrong" is always the worst bucket whatever the number says. */
export function readinessBucket(readiness: number, status: FunctionStatus): number {
  if (status === "wrong") return 4;
  if (readiness >= 0.85) return 0;
  if (readiness >= 0.65) return 1;
  if (readiness >= 0.5) return 2;
  if (readiness >= 0.3) return 3;
  return 4;
}
