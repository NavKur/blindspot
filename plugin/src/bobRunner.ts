import * as path from "node:path";
import * as vscode from "vscode";
import { parseBobOutput, splitCommand } from "./bobOutput";
import type { Log } from "./output";
import type { SessionCoins } from "./session";
import { getSettings } from "./settings";
import { runProcess } from "./shell";

export interface BobRunResult {
  ok: boolean;
  cost: number;
  summary: string;
  cancelled: boolean;
  timedOut: boolean;
}

export const BOB_TIMEOUT_MS = 10 * 60 * 1000;

/** Spawns headless Bob (or fake Bob) once, streams to the Output channel, returns the parsed result. */
export class BobRunner {
  constructor(
    private readonly extensionPath: string,
    private readonly log: Log,
    private readonly session: SessionCoins,
  ) {}

  /** The command and arguments that will be used, without the prompt. For display and tests. */
  command(): { command: string; args: string[]; fake: boolean } {
    const settings = getSettings();
    if (settings.useFakeBob) {
      return { command: process.execPath, args: [path.join(this.extensionPath, "scripts", "fake-bob.js")], fake: true };
    }
    const parts = splitCommand(settings.bobCommand);
    return { command: parts[0] ?? "bob", args: parts.slice(1), fake: false };
  }

  async runBob(prompt: string, cwd: string, token?: vscode.CancellationToken): Promise<BobRunResult> {
    const { command, args, fake } = this.command();
    this.log.line(`${fake ? "Fake Bob" : "Bob"}: ${command} ${args.join(" ")} <prompt>`);
    const result = await runProcess(command, [...args, prompt], {
      cwd,
      stdin: prompt,
      timeoutMs: BOB_TIMEOUT_MS,
      token,
      onLine: (line, stream) => {
        if (line.trim().startsWith("{")) return; // the JSON result is logged in summary form below
        this.log.line(`Bob${stream === "stderr" ? " (stderr)" : ""}: ${line}`);
      },
    });

    if (result.cancelled) {
      this.log.line("Bob: cancelled by you");
      return { ok: false, cost: 0, summary: "Cancelled.", cancelled: true, timedOut: false };
    }
    if (result.timedOut) {
      this.log.line("Bob: timed out after 10 minutes");
      return { ok: false, cost: 0, summary: "Bob timed out after 10 minutes.", cancelled: false, timedOut: true };
    }

    const parsed = parseBobOutput(result.stdout);
    if (parsed.cost > 0) this.session.add(parsed.cost);
    const ok = result.code === 0 && (parsed.status === undefined || parsed.status === "success");
    const summary = parsed.message || (ok ? "Bob finished without a message." : result.stderr.trim() || `Bob exited with code ${result.code}.`);
    this.log.line(`Bob: ${ok ? "done" : "failed"}. Cost ${parsed.cost.toFixed(2)} Bobcoins`);
    if (!ok && result.stderr.trim()) this.log.line(`Bob (stderr): ${result.stderr.trim().split("\n").slice(-3).join(" | ")}`);
    return { ok, cost: parsed.cost, summary, cancelled: false, timedOut: false };
  }
}
