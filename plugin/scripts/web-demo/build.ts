/*
 * Builds docs/demo/index.html: a self-contained web page that shows the Bob Readiness plugin
 * with the real exam data, for people who cannot install Bob IDE. The side panel is the plugin's
 * own webview HTML (src/panel/html.ts) fed by the plugin's own pure state builders; the editor,
 * Explorer and status bar are small imitations; Bob is a fake (nothing here calls IBM Bob).
 *
 * Run through scripts/build-web-demo.mjs, which bundles this file with esbuild first.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { describeContextChange, describeReportChange } from "../../src/changes";
import { parseContext, type ReadinessContext } from "../../src/contract";
import { ContextIndex } from "../../src/contextIndex";
import { buildHeatmap } from "../../src/heatmap";
import { ROLE_LABELS, SUGGESTED_BY_ROLE, type OnboardingRole } from "../../src/onboardingLogic";
import { panelHtml } from "../../src/panel/html";
import { buildPanelState } from "../../src/panel/state";
import { misconceptionHint } from "../../src/ranges";
import { computeVerdict, groupCommits, noteLines } from "../../src/releaseLogic";
import { buildExamView, compareRows } from "../../src/report/examView";
import { parseHistory, parseReport, type Report } from "../../src/report/reportContract";
import { treeDecoration } from "../../src/report/reportLogic";

// esbuild bundles this file into plugin/.tmp, so the runner passes the real source folder in.
const srcDir = process.env.WEB_DEMO_SRC ?? __dirname;
const pluginRoot = path.resolve(srcDir, "..", "..");
const repoRoot = path.resolve(pluginRoot, "..");
const dataDir = path.join(pluginRoot, "web-demo", "data");
const outDir = path.join(repoRoot, "docs", "demo");
const resultsDir = path.join(repoRoot, "results");
const sourceRoot = fs.existsSync(path.join(repoRoot, "target", "tinydb", "tinydb")) ? path.join(repoRoot, "target", "tinydb") : path.join(repoRoot, "presentation-tinydb");

const RUNS = ["test_C1_r1", "test_C2_r1"] as const;
const LABELS: Record<(typeof RUNS)[number], string> = { test_C1_r1: "Before Blindspot's notes (C1)", test_C2_r1: "After Blindspot's notes (C2)" };

function read(p: string): string {
  return fs.readFileSync(p, "utf8");
}

function loadReport(run: string): Report {
  const r = parseReport(read(path.join(resultsDir, `report_${run}.json`)));
  if (!r.ok) throw new Error(`report_${run}.json: ${JSON.stringify(r.problems.slice(0, 2))}`);
  return r.report;
}

function loadContext(run: string): ReadinessContext {
  const r = parseContext(read(path.join(dataDir, `readiness_${run}.json`)));
  if (!r.ok) throw new Error(`readiness_${run}.json: ${JSON.stringify(r.problems.slice(0, 2))}`);
  return r.context;
}

const COLORS: Record<string, string> = {
  "blindspot.red": "#fa4d56",
  "blindspot.heat0": "#42be65",
  "blindspot.heat1": "#8fd14f",
  "blindspot.heat2": "#f1c21b",
  "blindspot.heat3": "#ff832b",
  "blindspot.heat4": "#fa4d56",
};

const history = parseHistory(read(path.join(resultsDir, "history.jsonl"))).lines;
const allRuns = fs
  .readdirSync(resultsDir)
  .map((f) => f.match(/^report_(.+)\.json$/)?.[1])
  .filter((n): n is string => !!n && n !== "latest")
  .sort();
const reports = new Map(allRuns.map((r) => [r, loadReport(r)]));

const conditions: Record<string, unknown> = {};
const contexts: Record<string, ReadinessContext> = {};
for (const run of RUNS) {
  const report = reports.get(run)!;
  const ctx = loadContext(run);
  ctx.repo.name = "tinydb"; // the publish destination folder was named presentation-tinydb
  contexts[run] = ctx;
  const index = new ContextIndex(ctx);
  const panel = buildPanelState(index, new Set(), 0, "review");
  const exam = buildExamView({ report, history, source: "published", resultsDir: ".bob/blindspot", runs: allRuns });
  const heatmap = buildHeatmap(history, report, index);
  const roles = (Object.keys(ROLE_LABELS) as OnboardingRole[]).map((id) => ({ id, label: ROLE_LABELS[id] }));
  const onboarding = {
    setup: [...ctx.setup.install, ctx.setup.test],
    starterTasks: ctx.starter_tasks,
    messages: [],
    suggested: SUGGESTED_BY_ROLE.new,
    roles,
    role: "new",
    busy: false,
  };
  const commits = ["chore: Bob Readiness demo settings (real Bob, session budget 2)"];
  const release = {
    sinceLabel: "v4.9.0",
    commitCount: commits.length,
    changedFiles: [],
    changedFunctions: [],
    verdict: computeVerdict([], "unknown"),
    notes: noteLines(groupCommits(commits)),
  };
  const tree: Record<string, { badge?: string; tooltip: string; color: string }> = {};
  for (const m of report.modules) {
    const spec = treeDecoration(m, "module");
    tree[m.path] = { badge: spec.badge, tooltip: spec.tooltip, color: COLORS[spec.colorId] ?? "#999" };
  }
  for (const d of report.directories) {
    const spec = treeDecoration(d, "folder");
    tree[d.path] = { badge: spec.badge, tooltip: spec.tooltip, color: COLORS[spec.colorId] ?? "#999" };
  }
  const hints: Record<string, string> = {};
  for (const fn of ctx.functions) {
    const h = misconceptionHint(fn);
    if (h) hints[fn.id] = h;
  }
  conditions[run] = {
    label: LABELS[run],
    accuracy: exam.overall.accuracy,
    condition: report.run.condition,
    ctx,
    panel,
    exam,
    heatmap,
    onboarding,
    release,
    tree,
    hints,
    notes: read(path.join(dataDir, `notes_${run}.md`)),
  };
}

// Toast texts for switching between the two runs, from the plugin's own change descriptions.
const changes: Record<string, string[]> = {};
for (const from of RUNS) {
  for (const to of RUNS) {
    if (from === to) continue;
    changes[`${from}>${to}`] = [describeContextChange(contexts[from], contexts[to]), describeReportChange(reports.get(from), reports.get(to))].filter(
      (s): s is string => !!s,
    );
  }
}

// Every ordered pair for the Compare runs control.
const compares: Record<string, unknown> = {};
for (const a of allRuns) for (const b of allRuns) if (a !== b) compares[`${a}|${b}`] = compareRows(reports.get(a)!, reports.get(b)!);

// Source files the editor can show: every module the exam examined.
const files: Record<string, string> = {};
for (const m of reports.get("test_C1_r1")!.modules) {
  const p = path.join(sourceRoot, ...m.path.split("/"));
  if (fs.existsSync(p)) files[m.path] = read(p);
}
for (const extra of ["README.rst", "pyproject.toml", "tinydb/mypy_plugin.py", "tinydb/version.py"]) {
  const p = path.join(sourceRoot, ...extra.split("/"));
  if (fs.existsSync(p)) files[extra] = read(p);
}

const suggestedByRole = SUGGESTED_BY_ROLE;
const DATA = { runs: RUNS, defaultRun: "test_C1_r1", conditions, changes, compares, files, suggestedByRole, roleLabels: ROLE_LABELS, repoUrl: "https://github.com/NavKur/blindspot" };

// The plugin's real panel page, adapted to run inside an iframe: no CSP (it is a plain page now),
// theme variables defined here instead of by VS Code, and acquireVsCodeApi talking to the parent.
const themeCss = read(path.join(srcDir, "theme.css"));
const shim = `<script>
window.acquireVsCodeApi = function () {
  return { postMessage: function (m) { window.parent.postMessage({ source: "bob-readiness-panel", message: m }, "*"); } };
};
</script>`;
let panel = panelHtml("'self'", "demo");
panel = panel.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\s*/, () => "");
panel = panel.replace("<title>Bob Readiness</title>", () => `<title>Bob Readiness</title>\n<style>${themeCss}</style>\n${shim}`);

const shell = read(path.join(srcDir, "shell.html"));
const appJs = read(path.join(srcDir, "app.js"));
const shellCss = read(path.join(srcDir, "shell.css"));
// Function replacements: a string replacement would expand "$'" and "$`" found in the embedded source code.
const escapeForScript = (s: string) =>
  s.replace(/<\/script/gi, "<\\/script").split(String.fromCharCode(0x2028)).join("\\u2028").split(String.fromCharCode(0x2029)).join("\\u2029");
const page = shell
  .replace("/*SHELL_CSS*/", () => shellCss + "\n" + themeCss)
  .replace("/*DATA*/", () => `window.DEMO = ${escapeForScript(JSON.stringify(DATA))};`)
  .replace("/*PANEL_HTML*/", () => `window.PANEL_HTML = ${escapeForScript(JSON.stringify(panel))};`)
  .replace("/*APP_JS*/", () => escapeForScript(appJs));

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "index.html"), page, "utf8");
const kb = Math.round(fs.statSync(path.join(outDir, "index.html")).size / 1024);
console.log(`Wrote ${path.relative(repoRoot, path.join(outDir, "index.html"))} (${kb} KB): ${RUNS.join(", ")}, ${Object.keys(files).length} source files, ${Object.keys(compares).length} comparisons`);
