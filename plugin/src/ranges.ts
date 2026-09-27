import type { Finding, FunctionEntry, Severity } from "./contract";
import { percent } from "./contract";
import type { ContextIndex } from "./contextIndex";

/** 1-based inclusive line range, as in the context file. */
export interface LineRange {
  startLine: number;
  endLine: number;
}

export interface InlineHint {
  line: number;
  text: string;
}

export interface DecorationRanges {
  wrong: LineRange[];
  part: LineRange[];
  finding: LineRange[];
  hints: InlineHint[];
}

export const HINT_MAX_CHARS = 80;

/** Turn the context for one file into ranges per decoration type. Pure. */
export function decorationRangesForFile(index: ContextIndex, relPath: string): DecorationRanges {
  const out: DecorationRanges = { wrong: [], part: [], finding: [], hints: [] };
  for (const fn of index.functionsForFile(relPath)) {
    const range = { startLine: fn.line_start, endLine: fn.line_end };
    if (fn.status === "wrong") {
      out.wrong.push(range);
      const hint = misconceptionHint(fn);
      if (hint) out.hints.push({ line: fn.line_start, text: hint });
    } else if (fn.status === "part") {
      out.part.push(range);
    }
  }
  for (const finding of index.findingsForFile(relPath)) {
    out.finding.push({ startLine: finding.line_start, endLine: finding.line_end });
  }
  return out;
}

/** The boxed note from ref-00, shortened for an after-line hint. */
export function misconceptionHint(fn: FunctionEntry): string | undefined {
  const m = fn.misconceptions[0];
  if (!m) return undefined;
  return truncate(`Sure but wrong (${percent(m.confidence)}): Bob believed ${m.believed}. Actually, ${m.truth}.`, HINT_MAX_CHARS);
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, Math.max(0, max - 3)).trimEnd() + "...";
}

/** Clamp a 1-based inclusive range to a document of `lineCount` lines. Undefined if fully outside. */
export function clampRange(range: LineRange, lineCount: number): LineRange | undefined {
  if (lineCount <= 0) return undefined;
  const startLine = Math.max(1, Math.min(range.startLine, lineCount));
  const endLine = Math.max(startLine, Math.min(range.endLine, lineCount));
  if (range.startLine > lineCount) return undefined;
  return { startLine, endLine };
}

export type DiagnosticLevel = "warning" | "information" | "hint";

export function severityToLevel(severity: Severity): DiagnosticLevel {
  switch (severity) {
    case "high":
      return "warning";
    case "medium":
      return "information";
    case "low":
      return "hint";
  }
}

/** Findings that have not been sent to Bob before and are allowed. */
export function sendableFindings(findings: Finding[]): Finding[] {
  return findings.filter((f) => f.bob_allowed !== "no");
}
