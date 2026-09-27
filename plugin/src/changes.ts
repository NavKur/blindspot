import type { ReadinessContext } from "./contract";
import type { Report } from "./report/reportContract";
import { pct } from "./report/reportLogic";

/** Plain English summary of what changed between two loads of the readiness context. */
export function describeContextChange(previous: ReadinessContext | undefined, current: ReadinessContext): string | undefined {
  if (!previous) return undefined;
  const before = new Map(previous.functions.map((f) => [f.id, f]));
  let improved = 0;
  let worsened = 0;
  let newWrong = 0;
  let added = 0;
  for (const fn of current.functions) {
    const old = before.get(fn.id);
    if (!old) {
      added++;
      if (fn.status === "wrong") newWrong++;
      continue;
    }
    if (fn.readiness > old.readiness + 1e-9) improved++;
    else if (fn.readiness < old.readiness - 1e-9) worsened++;
    if (fn.status === "wrong" && old.status !== "wrong") newWrong++;
  }
  const removed = previous.functions.filter((f) => !current.functions.some((c) => c.id === f.id)).length;
  const parts: string[] = [];
  if (improved) parts.push(`${improved} function${improved === 1 ? "" : "s"} improved`);
  if (worsened) parts.push(`${worsened} got worse`);
  if (newWrong) parts.push(`${newWrong} new sure but wrong`);
  if (added) parts.push(`${added} added`);
  if (removed) parts.push(`${removed} removed`);
  const readinessMoved = Math.round(previous.summary.readiness * 100) !== Math.round(current.summary.readiness * 100);
  if (readinessMoved) parts.push(`readiness ${pct(previous.summary.readiness)} to ${pct(current.summary.readiness)}`);
  if (parts.length === 0) return undefined;
  return `Readiness context updated: ${parts.join(", ")}.`;
}

/** Plain English summary of what changed between two exam reports. */
export function describeReportChange(previous: Report | undefined, current: Report): string | undefined {
  if (!previous) return undefined;
  if (previous.run.name === current.run.name && previous.generated_at === current.generated_at) return undefined;
  const parts = [`${current.run.name}`];
  parts.push(`accuracy ${pct(previous.overall.accuracy)} to ${pct(current.overall.accuracy)}`);
  const cleared = previous.red_modules.filter((m) => !current.red_modules.includes(m));
  const newRed = current.red_modules.filter((m) => !previous.red_modules.includes(m));
  if (cleared.length) parts.push(`no longer red: ${cleared.join(", ")}`);
  if (newRed.length) parts.push(`now red: ${newRed.join(", ")}`);
  if (!cleared.length && !newRed.length) parts.push(`${current.red_modules.length} red module${current.red_modules.length === 1 ? "" : "s"}`);
  return `Exam report updated: ${parts.join(", ")}.`;
}
