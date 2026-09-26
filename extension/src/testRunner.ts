import type * as vscode from "vscode";
import { tail } from "./bobOutput";
import type { Log } from "./output";
import { runProcess } from "./shell";

export interface TestOutcome {
  passed: boolean;
  code: number | null;
  /** One line such as "217 passed in 5.8s". */
  summary: string;
  /** Last 20 lines of combined output. */
  output: string;
}

/** Find the pytest style summary line, or fall back to the last non-empty line. */
export function summarizeTestOutput(output: string, code: number | null): string {
  const lines = output.trimEnd().split("\n").map((l) => l.replace(/^[=\s]+|[=\s]+$/g, "")).filter(Boolean);
  const summary = [...lines].reverse().find((l) => /\b(passed|failed|error|errors|no tests ran)\b/i.test(l));
  if (summary) return summary;
  if (lines.length) return lines[lines.length - 1];
  return code === 0 ? "passed" : `exit code ${code ?? "unknown"}`;
}

export async function runTests(command: string, cwd: string, log: Log, token?: vscode.CancellationToken): Promise<TestOutcome> {
  log.line(`Running: ${command}`);
  const result = await runProcess(command, [], {
    cwd,
    shell: true,
    timeoutMs: 10 * 60 * 1000,
    token,
    onLine: (line) => log.line(`tests: ${line}`),
  });
  const combined = `${result.stdout}\n${result.stderr}`.trim();
  const passed = result.code === 0 && !result.timedOut && !result.cancelled;
  const summary = result.timedOut ? "tests timed out" : summarizeTestOutput(combined, result.code);
  log.line(passed ? summary : `Tests failed: ${summary}`);
  return { passed, code: result.code, summary, output: tail(combined, 20) };
}
