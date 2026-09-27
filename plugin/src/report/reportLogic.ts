import type { HistoryLine, ModuleEntry, NodeMetrics, Report } from "./reportContract";

/** Five heat buckets, 0 fine to 4 worst. Colour ids are contributed in package.json. */
export type HeatBucket = 0 | 1 | 2 | 3 | 4;

export function heatBucket(heat: number): HeatBucket {
  if (heat < 0.2) return 0;
  if (heat < 0.4) return 1;
  if (heat < 0.6) return 2;
  if (heat < 0.8) return 3;
  return 4;
}

export const HEAT_COLOR_IDS = [
  "blindspot.heat0",
  "blindspot.heat1",
  "blindspot.heat2",
  "blindspot.heat3",
  "blindspot.heat4",
] as const;
export const RED_COLOR_ID = "blindspot.red";

export interface TreeDecorationSpec {
  badge?: string;
  colorId: string;
  tooltip: string;
}

/**
 * The colouring rule from REPORT_SCHEMA.md: red gives a red badge, otherwise colour by heat,
 * and a "few answers" marker when low_n. Files without an entry get nothing (neutral).
 */
export function treeDecoration(node: NodeMetrics & { red?: boolean; red_reasons?: string[] }, label: string): TreeDecorationSpec {
  const red = node.red === true;
  const parts = [
    `Blindspot ${label}: accuracy ${pct(node.accuracy)} (95% interval ${pct(node.ci_low)} to ${pct(node.ci_high)}), ` +
      `confidently wrong ${pct(node.cw_rate)} (${node.cw_count} of ${node.n}), heat ${node.heat.toFixed(2)}`,
  ];
  if (red) parts.push(`Red: ${(node.red_reasons ?? []).join("; ") || "over the red thresholds"}`);
  if (node.low_n) parts.push(`Few answers (${node.n}): the interval is very wide`);
  let badge: string | undefined;
  if (red) badge = node.low_n ? "!?" : "!";
  else if (node.low_n) badge = "?";
  return {
    badge,
    colorId: red ? RED_COLOR_ID : HEAT_COLOR_IDS[heatBucket(node.heat)],
    tooltip: parts.join(". "),
  };
}

export function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

/** Worst first: red modules by severity (highest cw_rate, lowest ci_low), then the rest by heat. */
export function modulesWorstFirst(modules: ModuleEntry[]): ModuleEntry[] {
  return [...modules].sort((a, b) => {
    if (a.red !== b.red) return a.red ? -1 : 1;
    if (a.cw_rate !== b.cw_rate) return b.cw_rate - a.cw_rate;
    if (a.ci_low !== b.ci_low) return a.ci_low - b.ci_low;
    return a.module.localeCompare(b.module);
  });
}

export interface ModuleDelta {
  path: string;
  module: string;
  accuracyA?: number;
  accuracyB?: number;
  cwA?: number;
  cwB?: number;
  heatA?: number;
  heatB?: number;
  redA?: boolean;
  redB?: boolean;
  /** Change in accuracy (B minus A), undefined when the module is missing on one side. */
  accuracyDelta?: number;
  cwDelta?: number;
}

/** Per-module comparison of two runs, sorted by biggest accuracy change first. */
export function compareReports(a: Report, b: Report): ModuleDelta[] {
  const byPath = new Map<string, ModuleDelta>();
  for (const m of a.modules) {
    byPath.set(m.path, { path: m.path, module: m.module, accuracyA: m.accuracy, cwA: m.cw_rate, heatA: m.heat, redA: m.red });
  }
  for (const m of b.modules) {
    const d = byPath.get(m.path) ?? { path: m.path, module: m.module };
    d.accuracyB = m.accuracy;
    d.cwB = m.cw_rate;
    d.heatB = m.heat;
    d.redB = m.red;
    byPath.set(m.path, d);
  }
  const out = [...byPath.values()];
  for (const d of out) {
    if (d.accuracyA !== undefined && d.accuracyB !== undefined) d.accuracyDelta = d.accuracyB - d.accuracyA;
    if (d.cwA !== undefined && d.cwB !== undefined) d.cwDelta = d.cwB - d.cwA;
  }
  return out.sort((x, y) => Math.abs(y.accuracyDelta ?? 0) - Math.abs(x.accuracyDelta ?? 0) || x.path.localeCompare(y.path));
}

export interface SeriesPoint {
  x: string;
  y: number;
}

export interface Series {
  condition: string;
  points: SeriesPoint[];
}

/** One series per condition, points in time order. */
export function historySeries(lines: HistoryLine[], metric: "accuracy" | "cw_rate"): Series[] {
  const map = new Map<string, SeriesPoint[]>();
  for (const l of lines) {
    const pts = map.get(l.condition) ?? [];
    pts.push({ x: l.generated_at, y: l[metric] });
    map.set(l.condition, pts);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([condition, points]) => ({ condition, points }));
}

/** Per-file accuracy over time, in time order, for a sparkline. */
export function fileSparkline(lines: HistoryLine[], path: string, metric: "accuracy" | "cw_rate" | "heat" = "accuracy"): number[] {
  return lines.map((l) => l.modules[path]?.[metric]).filter((v): v is number => typeof v === "number");
}

/**
 * SVG polyline points for values in [0, 1], drawn left to right across a width x height box.
 * Values are spread evenly in x. A single value becomes a flat line.
 */
export function polylinePoints(values: number[], width: number, height: number, pad = 2): string {
  if (values.length === 0) return "";
  const xs = values.length === 1 ? [pad, width - pad] : values.map((_, i) => pad + (i * (width - 2 * pad)) / (values.length - 1));
  const ys = values.length === 1 ? [values[0], values[0]] : values;
  return xs.map((x, i) => `${x.toFixed(1)},${(height - pad - clamp01(ys[i]) * (height - 2 * pad)).toFixed(1)}`).join(" ");
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Timestamps shared across all series, sorted, so multiple lines align on one x axis. */
export function timeAxis(series: Series[]): string[] {
  const set = new Set<string>();
  for (const s of series) for (const p of s.points) set.add(p.x);
  return [...set].sort();
}

/** Values of a series aligned to a shared axis; gaps are filled by carrying the last value. */
export function alignSeries(series: Series, axis: string[]): number[] {
  const byX = new Map(series.points.map((p) => [p.x, p.y]));
  const out: number[] = [];
  let last: number | undefined;
  for (const x of axis) {
    const v = byX.get(x);
    if (v !== undefined) last = v;
    if (last !== undefined) out.push(last);
  }
  return out;
}

/** "27 Sep 2026, 00:14 UTC" from an ISO timestamp. Falls back to the raw text. */
export function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

/** Top level folder of the first module path, e.g. "tinydb". */
export function guessRepoName(report: Report): string {
  const first = report.modules[0]?.path ?? report.directories[0]?.path;
  return first ? first.split("/")[0] : "target";
}
