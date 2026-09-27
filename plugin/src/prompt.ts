import type { Finding, ReadinessContext } from "./contract";
import type { ContextIndex } from "./contextIndex";

/** ONE prompt for all selected findings. Pure. */
export function buildBobPrompt(findings: Finding[], index: ContextIndex, notesMarkdown: string | undefined): string {
  const lines: string[] = [];
  lines.push("You are making small, careful changes in this repository on a dedicated git branch.");
  lines.push("Change only what is listed below. Keep public function names and parameters unchanged.");
  lines.push("Where an item is a test gap, add or update tests; do not change the code under test unless the item says so.");
  lines.push("Do not touch files that are not listed. Do not commit. When done, summarise what you changed per item id.");
  lines.push("");
  const withNotes = findings.some((f) => f.bob_allowed === "with_notes");
  if (withNotes && notesMarkdown?.trim()) {
    lines.push("Study notes about this repository. Items marked (with study notes) depend on them; read them first:");
    lines.push("");
    lines.push(notesMarkdown.trim());
    lines.push("");
  }
  lines.push(`Items to do (${findings.length}):`);
  lines.push("");
  findings.forEach((f, i) => {
    const fn = index.functionById(f.function_id);
    lines.push(`Item ${i + 1}: ${f.id} (${f.type}, ${f.severity})${f.bob_allowed === "with_notes" ? " (with study notes)" : ""}`);
    lines.push(`FILE: ${f.file} LINE: ${f.line_start}`);
    if (fn) lines.push(`Function: ${fn.name} (lines ${fn.line_start} to ${fn.line_end})`);
    lines.push(`Title: ${f.title}`);
    lines.push(`Detail: ${f.detail}`);
    lines.push(`Recommendation: ${f.recommendation}`);
    for (const m of fn?.misconceptions ?? []) {
      lines.push(`Warning: you previously believed "${m.believed}". The truth is: ${m.truth}.`);
    }
    lines.push("");
  });
  return lines.join("\n");
}

/** Read-only onboarding prompt. Pure. */
export function buildOnboardingPrompt(question: string, ctx: ReadinessContext, notesMarkdown: string | undefined): string {
  const lines: string[] = [];
  lines.push("You are helping a new developer understand this repository.");
  lines.push("Answer in plain English in under 150 words. Do not edit any files.");
  lines.push("");
  if (notesMarkdown?.trim()) {
    lines.push("Notes about this repository:");
    lines.push(notesMarkdown.trim());
    lines.push("");
  }
  lines.push("Architecture (file, readiness of Bob's knowledge, imports):");
  for (const f of ctx.files) {
    const imports = f.imports.length ? ` imports ${f.imports.join(", ")}` : "";
    lines.push(`- ${f.path} (${Math.round(f.readiness * 100)}% ${f.status})${imports}`);
  }
  lines.push("");
  lines.push("Question:");
  lines.push(question.trim());
  return lines.join("\n");
}

/** bob/readiness-yyyymmdd-hhmm in local time. */
export function branchName(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `bob/readiness-${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}`;
}

/** Short description of one finding for the modal, like "F001 table.py: Bob was sure ... (with study notes)". */
export function findingSummaryLine(f: Finding): string {
  const base = f.file.split("/").pop() ?? f.file;
  const notes = f.bob_allowed === "with_notes" ? " (with study notes)" : "";
  return `${f.id} ${base}: ${f.title}${notes}`;
}

export function commitMessageFor(findings: Finding[]): string {
  const ids = findings.map((f) => f.id).join(", ");
  return `bob: readiness fixes for ${ids}`;
}
