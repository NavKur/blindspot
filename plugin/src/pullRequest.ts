import type { Finding } from "./contract";
import { gateLabel } from "./contract";
import type { FileStat } from "./gitParse";

export interface PullRequestInput {
  branch: string;
  base: string;
  findings: Finding[];
  files: FileStat[];
  cost: number;
  tests: { passed: boolean; summary: string } | undefined;
  bobSummary?: string;
  fake: boolean;
}

export function pullRequestTitle(findings: Finding[]): string {
  const ids = findings.map((f) => f.id).join(", ");
  return findings.length === 1 ? `Bob: ${findings[0].title}` : `Bob: readiness fixes for ${ids}`;
}

/** Markdown body a reviewer can trust: what changed, why, and how much Bob knew about each area. */
export function pullRequestBody(input: PullRequestInput): string {
  const lines: string[] = [];
  lines.push(`Bob made these changes on \`${input.branch}\` after a developer approved each item in Bob Readiness.`);
  lines.push("");
  lines.push("## Items");
  lines.push("");
  lines.push("| Id | Type | Where | Readiness gate | What was asked |");
  lines.push("|---|---|---|---|---|");
  for (const f of input.findings) {
    lines.push(`| ${f.id} | ${f.type.replace("_", " ")} | \`${f.file}:${f.line_start}\` | ${gateLabel(f.bob_allowed)} | ${f.title.replace(/\|/g, "/")} |`);
  }
  lines.push("");
  const notes = input.findings.filter((f) => f.bob_allowed === "with_notes");
  if (notes.length) {
    lines.push(`Review closely: ${notes.map((f) => f.id).join(", ")} touch areas where Bob was only partly right before. The study notes were included in the prompt.`);
    lines.push("");
  }
  lines.push("## Changed files");
  lines.push("");
  if (input.files.length === 0) lines.push("No files changed.");
  for (const s of input.files) lines.push(`- \`${s.path}\` (+${s.added} -${s.removed})`);
  lines.push("");
  lines.push("## Tests");
  lines.push("");
  lines.push(input.tests ? `${input.tests.passed ? "Passed" : "Failed"}: ${input.tests.summary}` : "Not run.");
  lines.push("");
  if (input.bobSummary) {
    lines.push("## Bob's summary");
    lines.push("");
    lines.push(input.bobSummary.trim());
    lines.push("");
  }
  lines.push(`Cost: ${input.cost.toFixed(1)} Bobcoins${input.fake ? " (fake Bob, development run)" : ""}. Base branch: \`${input.base}\`.`);
  return lines.join("\n");
}
