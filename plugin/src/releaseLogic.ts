import type { FunctionEntry } from "./contract";
import { percent, statusLabel } from "./contract";
import type { ContextIndex } from "./contextIndex";
import type { HunkRange } from "./gitParse";

export type TestsState = "passed" | "failed" | "unknown";

export interface ChangedFunction {
  id: string;
  name: string;
  file: string;
  line: number;
  status: FunctionEntry["status"];
  statusLabel: string;
  tested: boolean;
  readiness: number;
}

export interface ChangedFile {
  path: string;
  label: string;
  readiness: number;
  known: boolean;
}

export interface Verdict {
  kind: "ready" | "check" | "not-ready";
  title: "Ready to release" | "Ready, with items to check" | "Not ready";
  reason: string;
}

export interface NoteGroups {
  fixed: string[];
  added: string[];
  other: string[];
}

/** Functions whose line range overlaps a changed range in the same file. */
export function changedFunctions(index: ContextIndex, ranges: Map<string, HunkRange[]>): ChangedFunction[] {
  const out: ChangedFunction[] = [];
  const seen = new Set<string>();
  for (const [file, hunks] of ranges) {
    for (const fn of index.functionsForFile(file)) {
      const hit = hunks.some((h) => h.start <= fn.line_end && fn.line_start <= h.end);
      if (!hit || seen.has(fn.id)) continue;
      seen.add(fn.id);
      out.push({
        id: fn.id,
        name: fn.name,
        file: fn.file,
        line: fn.line_start,
        status: fn.status,
        statusLabel: statusLabel(fn.status),
        tested: fn.tested,
        readiness: fn.readiness,
      });
    }
  }
  return out.sort((a, b) => a.readiness - b.readiness || a.name.localeCompare(b.name));
}

export function changedFiles(index: ContextIndex, paths: string[]): ChangedFile[] {
  const byPath = new Map(index.context.files.map((f) => [f.path, f]));
  return paths.map((p) => {
    const known = byPath.get(p);
    return { path: p, label: p.split("/").pop() ?? p, readiness: known?.readiness ?? 0, known: !!known };
  });
}

/**
 * Fixed rules from BUILD_PLAN.md phase 5:
 * Not ready: a changed function is wrong and not tested (or the tests fail).
 * Ready, with items to check: a changed function is wrong or part but tested (or tests not run yet).
 * Ready to release: tests pass and no changed function is wrong.
 */
export function computeVerdict(changed: ChangedFunction[], tests: TestsState): Verdict {
  const untestedWrong = changed.filter((f) => f.status === "wrong" && !f.tested);
  if (untestedWrong.length) {
    return {
      kind: "not-ready",
      title: "Not ready",
      reason: `${list(untestedWrong)} changed where Bob was wrong before and there are no tests.`,
    };
  }
  if (tests === "failed") {
    return { kind: "not-ready", title: "Not ready", reason: "The tests fail." };
  }
  const wrong = changed.filter((f) => f.status === "wrong");
  if (wrong.length) {
    return {
      kind: "check",
      title: "Ready, with items to check",
      reason: `${list(wrong)} changed in an area where Bob was wrong before. ${wrong.length === 1 ? "It is" : "They are"} tested.`,
    };
  }
  const part = changed.filter((f) => f.status === "part");
  if (part.length) {
    return {
      kind: "check",
      title: "Ready, with items to check",
      reason: `${list(part)} changed in an area Bob only partly knows. ${part.length === 1 ? "It is" : "They are"} tested.`,
    };
  }
  if (tests === "unknown") {
    return { kind: "check", title: "Ready, with items to check", reason: "No risky functions changed. Run the tests to confirm." };
  }
  return {
    kind: "ready",
    title: "Ready to release",
    reason: changed.length ? "Tests pass and no changed function is in an area where Bob was wrong." : "Tests pass and nothing Bob studied has changed.",
  };
}

function list(fns: ChangedFunction[]): string {
  const names = fns.map((f) => `${f.name.split(".").pop()}()`);
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
}

/** Group commit subjects: fix -> Fixed, feat -> Added, everything else -> Other. */
export function groupCommits(subjects: string[]): NoteGroups {
  const groups: NoteGroups = { fixed: [], added: [], other: [] };
  for (const s of subjects) {
    const m = s.match(/^(\w+)(\([^)]*\))?!?:\s*(.*)$/);
    const type = m?.[1].toLowerCase();
    const text = m ? m[3] : s;
    if (type?.startsWith("fix")) groups.fixed.push(text);
    else if (type?.startsWith("feat")) groups.added.push(text);
    else groups.other.push(text);
  }
  return groups;
}

/** Lines for the panel: "Fixed: ...", "Added: ...", "Other: ...". */
export function noteLines(groups: NoteGroups): string[] {
  return [
    ...groups.fixed.map((t) => `Fixed: ${t}`),
    ...groups.added.map((t) => `Added: ${t}`),
    ...groups.other.map((t) => `Other: ${t}`),
  ];
}

/** Markdown for the clipboard. */
export function notesMarkdown(groups: NoteGroups, sinceLabel: string, changed: ChangedFile[]): string {
  const lines: string[] = [`# Release notes (since ${sinceLabel})`, ""];
  const section = (title: string, items: string[]) => {
    if (!items.length) return;
    lines.push(`## ${title}`);
    for (const i of items) lines.push(`- ${i}`);
    lines.push("");
  };
  section("Fixed", groups.fixed);
  section("Added", groups.added);
  section("Other", groups.other);
  if (changed.length) {
    lines.push("## Readiness of changed files");
    for (const f of changed) lines.push(`- ${f.path}: ${f.known ? percent(f.readiness) : "not studied"}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}
