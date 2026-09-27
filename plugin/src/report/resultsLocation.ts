import * as path from "node:path";

/** Where the report files were found. */
export type ResultsSource = "results" | "sim" | "published";

export interface ResultsLocation {
  /** Absolute folder holding report_latest.json. */
  dir: string;
  source: ResultsSource;
}

export type Exists = (p: string) => Promise<boolean>;

/** Folder inside the examined repository where `python cli.py publish` copies the reports. */
export const PUBLISHED_REPORTS_DIR = ".bob/blindspot";

/**
 * The folder to read reports from, in this order:
 * 1. `<root>/<resultsPath>` (the engine's results folder, default `results`),
 * 2. `<root>/<resultsPath>/sim` (simulated data, shown with a banner),
 * 3. `<root>/.bob/blindspot` (copies written by `publish` into the examined repository, so the
 *    Exam tab works when that repository is the workspace).
 * Undefined when none of them has a report_latest.json.
 */
export async function pickResultsDir(root: string, resultsPath: string, exists: Exists): Promise<ResultsLocation | undefined> {
  const primary = path.resolve(root, resultsPath.trim() || "results");
  const candidates: ResultsLocation[] = [
    { dir: primary, source: "results" },
    { dir: path.join(primary, "sim"), source: "sim" },
    { dir: path.join(root, ...PUBLISHED_REPORTS_DIR.split("/")), source: "published" },
  ];
  for (const c of candidates) {
    if (await exists(path.join(c.dir, "report_latest.json"))) return c;
  }
  return undefined;
}

/** Glob patterns (relative to the workspace folder) the report store must watch. */
export function reportWatchGlobs(resultsPath: string): string[] {
  const base = (resultsPath.trim() || "results").replace(/\/+$/, "");
  const globs: string[] = [];
  for (const dir of [base, `${base}/sim`, PUBLISHED_REPORTS_DIR]) {
    globs.push(`${dir}/report_latest.json`, `${dir}/history.jsonl`);
  }
  return globs;
}

/**
 * The Blindspot engine checkout that owns `cli.py`, starting at `start` and walking up at most
 * `maxLevels` parent folders. When the examined repository (target/tinydb) is the workspace, the
 * engine is two levels up. Undefined when no folder has both cli.py and blindspot/publish.py.
 */
export async function findEngineRoot(start: string, exists: Exists, maxLevels = 4): Promise<string | undefined> {
  let dir = path.resolve(start);
  for (let level = 0; level <= maxLevels; level++) {
    if ((await exists(path.join(dir, "cli.py"))) && (await exists(path.join(dir, "blindspot", "publish.py")))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/**
 * The publish command to run in `engineRoot`. A bare `python` is replaced by the engine's
 * virtualenv interpreter when one exists, and `--dest <targetRoot>` is added so the files land in
 * the examined repository the plugin is showing (the engine root itself is never a destination),
 * unless the command already names a destination.
 */
export function publishCommandFor(command: string, engineRoot: string, targetRoot: string | undefined, venvPython: string | undefined): string {
  let cmd = command.trim();
  if (venvPython && /^python3?(\s|$)/.test(cmd)) cmd = `"${venvPython}" ${cmd.replace(/^python3?\s*/, "")}`.trim();
  const hasDest = /(^|\s)--dest(\s|=|$)/.test(cmd);
  if (targetRoot !== undefined && path.resolve(targetRoot) !== path.resolve(engineRoot) && !hasDest) cmd += ` --dest "${targetRoot}"`;
  return cmd;
}
