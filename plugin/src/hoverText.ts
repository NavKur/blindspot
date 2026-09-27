import { findingTypeLabel, gateLabel, percent, statusLabel, type Finding, type FunctionEntry } from "./contract";
import type { ContextIndex } from "./contextIndex";

export interface HoverOptions {
  /** Finding ids already in the queue, to label the link accordingly. */
  queued?: ReadonlySet<string>;
}

const STATUS_COLOR: Record<FunctionEntry["status"], string> = {
  wrong: "var(--vscode-errorForeground)",
  part: "var(--vscode-textLink-foreground)",
  ok: "var(--vscode-testing-iconPassed)",
};

/** Markdown for the hover card at a 1-based line. Undefined when nothing is highlighted there. */
export function hoverMarkdownForLine(
  index: ContextIndex,
  relPath: string,
  line: number,
  options: HoverOptions = {},
): string | undefined {
  const fns = index.functionsAtLine(relPath, line).filter((f) => f.status !== "ok");
  const findings = index.findingsAtLine(relPath, line);
  if (fns.length === 0 && findings.length === 0) return undefined;

  const sections: string[] = [];
  const shownFindings = new Set<string>();

  for (const fn of fns) {
    sections.push(functionHeader(fn));
    for (const m of fn.misconceptions) {
      sections.push(`Bob was **${percent(m.confidence)} sure** that ${m.believed}.  \n**Actually:** ${m.truth}.`);
    }
    for (const finding of index.findingsForFunction(fn.id)) {
      if (finding.line_start <= line && line <= finding.line_end) {
        sections.push(findingSection(finding));
        shownFindings.add(finding.id);
      }
    }
  }
  for (const finding of findings) {
    if (!shownFindings.has(finding.id)) {
      const fn = index.functionById(finding.function_id);
      if (fn && fn.status === "ok") sections.push(functionHeader(fn));
      sections.push(findingSection(finding));
      shownFindings.add(finding.id);
    }
  }
  const actionable = [...shownFindings].map((id) => index.findingById(id)).filter((f): f is Finding => !!f);
  for (const finding of actionable) {
    sections.push(queueLink(finding, options.queued?.has(finding.id) ?? false));
  }
  return sections.join("\n\n---\n\n");
}

function functionHeader(fn: FunctionEntry): string {
  return `**${fn.name}** readiness ${percent(fn.readiness)} <span style="color:${STATUS_COLOR[fn.status]};">${statusLabel(fn.status)}</span>`;
}

function findingSection(finding: Finding): string {
  return (
    `<span style="color:var(--vscode-editorWarning-foreground);">Finding ${finding.id}, ${findingTypeLabel(finding.type)}, ${finding.severity}</span>  \n` +
    `${finding.recommendation}`
  );
}

function queueLink(finding: Finding, queued: boolean): string {
  if (finding.bob_allowed === "no") {
    return `Needs a person (${finding.id} cannot be sent to Bob)`;
  }
  const arg = encodeURIComponent(JSON.stringify([finding.id]));
  const label = queued ? "Remove from Bob queue" : "Add to Bob queue";
  return `[${label}](command:bobReadiness.queueFinding?${arg} "${label}: ${finding.id}") (${gateLabel(finding.bob_allowed)})`;
}
