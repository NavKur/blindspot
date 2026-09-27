import { percent, statusLabel } from "./contract";
import type { ContextIndex } from "./contextIndex";
import type { ModuleEntry } from "./report/reportContract";
import { pct } from "./report/reportLogic";

export interface FileContextInput {
  relPath: string;
  index?: ContextIndex;
  module?: ModuleEntry;
  notes?: string;
}

/**
 * A prompt preamble about one file: what Bob got wrong here, what is true, how well it knows
 * the file. Developers paste it before asking Bob anything about the file. Pure.
 */
export function fileContextText(input: FileContextInput): string {
  const { relPath, index, module, notes } = input;
  const lines: string[] = [`Context about ${relPath} for Bob. Read this before answering or editing.`, ""];
  if (module) {
    lines.push(
      `Exam result for this module (${module.module}): accuracy ${pct(module.accuracy)} on ${module.n} questions ` +
        `(95% interval ${pct(module.ci_low)} to ${pct(module.ci_high)}), confidently wrong ${module.cw_count} time${module.cw_count === 1 ? "" : "s"}.` +
        (module.red ? ` This module is RED: ${module.red_reasons.join("; ")}.` : ""),
    );
    const weak = Object.entries(module.by_family).filter(([, acc]) => acc < 0.7);
    if (weak.length) lines.push(`Weak question families: ${weak.map(([f, acc]) => `${f} (${pct(acc)})`).join(", ")}.`);
    lines.push("");
  }
  const fns = index?.functionsForFile(relPath) ?? [];
  const wrong = fns.filter((f) => f.status === "wrong");
  const part = fns.filter((f) => f.status === "part");
  if (wrong.length) {
    lines.push("Things you were sure about but got wrong:");
    for (const fn of wrong) {
      for (const m of fn.misconceptions) {
        lines.push(`- ${fn.name}: you believed ${m.believed}. The truth: ${m.truth}.`);
      }
      if (fn.misconceptions.length === 0) lines.push(`- ${fn.name}: your answers were confidently wrong. Check the code before relying on memory.`);
    }
    lines.push("");
  }
  if (part.length) {
    lines.push(`Only partly known (verify against the code): ${part.map((f) => `${f.name} (${percent(f.readiness)})`).join(", ")}.`);
    lines.push("");
  }
  const findings = index?.findingsForFile(relPath) ?? [];
  if (findings.length) {
    lines.push("Open findings here:");
    for (const f of findings) lines.push(`- ${f.id} (${f.type}, ${f.severity}): ${f.title}. ${f.recommendation}`);
    lines.push("");
  }
  if (notes?.trim()) {
    lines.push("Study notes for this repository:");
    lines.push(notes.trim());
    lines.push("");
  }
  if (!module && fns.length === 0 && findings.length === 0) {
    lines.push("Bob has not been examined on this file. Treat its answers about it as unverified.");
    lines.push("");
  } else if (fns.length) {
    const known = fns.filter((f) => f.status === "ok");
    if (known.length) lines.push(`Well known: ${known.map((f) => f.name).join(", ")}.`);
    lines.push(`Functions here: ${fns.map((f) => `${f.name} ${statusLabel(f.status).toLowerCase()}`).join("; ")}.`);
    lines.push("");
  }
  lines.push("Rules: quote the code rather than memory for anything listed above. Keep public names and parameters unchanged.");
  return lines.join("\n");
}
