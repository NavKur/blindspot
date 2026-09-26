import type { Finding, FunctionEntry } from "./contract";
import { canQueue } from "./queueLogic";

export interface LensText {
  title: string;
  command: string;
  args: unknown[];
}

/** The CodeLens entries for one function with findings. Pure. */
export function lensesForFunction(fn: FunctionEntry, findings: Finding[]): LensText[] {
  if (findings.length === 0) return [];
  const sendable = findings.filter(canQueue);
  const lenses: LensText[] = [];
  if (sendable.length === 0) {
    lenses.push({ title: "Needs a person", command: "bobReadiness.whyUnsure", args: [fn.id] });
  } else {
    lenses.push({
      title: `Add to Bob queue (${sendable.length})`,
      command: "bobReadiness.queueFunction",
      args: [fn.id],
    });
  }
  lenses.push({ title: "Why Bob is unsure", command: "bobReadiness.whyUnsure", args: [fn.id] });
  return lenses;
}
