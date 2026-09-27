import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import type { BobRunner } from "./bobRunner";
import type { Finding } from "./contract";
import type { ContextStore } from "./contextStore";
import { Git } from "./git";
import type { FileStat } from "./gitParse";
import type { Log } from "./output";
import type { PanelExtras, PanelMessage } from "./panel/PanelProvider";
import { formatCoins, queueTotals } from "./queueLogic";
import { branchName, buildBobPrompt, commitMessageFor, findingSummaryLine } from "./prompt";
import type { Queue } from "./queue";
import { getSettings } from "./settings";
import { runTests, type TestOutcome } from "./testRunner";

/** What the panel renders while and after Bob works (ref-03, part 3). */
export interface RunView {
  title: string;
  branch: string;
  costLabel: string;
  stage?: string;
  files: FileStat[];
  tests?: { kind: "pass" | "fail" | "running"; title: string; summary: string; output?: string };
  done: string[];
  error?: string;
  canDecide: boolean;
}

interface RunState {
  branch: string;
  base: string;
  findings: Finding[];
  cost: number;
  stage?: string;
  files: FileStat[];
  tests?: TestOutcome | "running";
  summary?: string;
  error?: string;
  canDecide: boolean;
  cancel?: vscode.CancellationTokenSource;
}

/** The human-in-the-loop flow: modal approval, new branch, one Bob run, tests, keep or discard. */
export class Approval implements PanelExtras {
  private run: RunState | undefined;

  constructor(
    private readonly store: ContextStore,
    private readonly queue: Queue,
    private readonly runner: BobRunner,
    private readonly log: Log,
    private readonly onChange: () => void,
  ) {}

  extraState(): { run?: RunView } {
    return { run: this.view() };
  }

  async handle(msg: PanelMessage): Promise<boolean> {
    switch (msg.type) {
      case "sendToBob":
        await this.sendToBob();
        return true;
      case "keep":
        await this.keep();
        return true;
      case "discard":
        await this.discard();
        return true;
      case "cancelRun":
        this.run?.cancel?.cancel();
        return true;
      case "dismissRun":
        if (this.run && !this.run.canDecide) {
          this.run = undefined;
          this.onChange();
        }
        return true;
      case "openDiff":
        await this.openDiff(msg.file);
        return true;
      default:
        return false;
    }
  }

  get busy(): boolean {
    return this.run !== undefined;
  }

  async sendToBob(): Promise<void> {
    if (this.run) {
      void vscode.window.showInformationMessage("Bob is already working, or waiting for your Keep or Discard decision.");
      return;
    }
    const root = this.store.workspaceRoot;
    const ctx = this.store.getContext();
    if (!root || !ctx) {
      void vscode.window.showWarningMessage("Bob Readiness: no workspace or context file.");
      return;
    }
    // Findings with bob_allowed "no" can never get here: the queue refuses them.
    const findings = this.queue.selectedFindings().filter((f) => f.bob_allowed !== "no");
    if (findings.length === 0) {
      void vscode.window.showInformationMessage("Nothing selected. Tick findings first.");
      return;
    }
    const settings = getSettings();
    const branch = branchName(new Date());
    const files = new Set(findings.map((f) => f.file));
    const totals = queueTotals(findings);
    const detail = [
      `Bob will change ${findings.length} place${findings.length === 1 ? "" : "s"} in ${files.size} file${files.size === 1 ? "" : "s"}:`,
      ...findings.map((f) => `- ${findingSummaryLine(f)}`),
      "",
      `Work happens on a new branch ${branch}. Your current branch is not touched.`,
      "",
      `Estimated cost: ${formatCoins(totals.coins)}.`,
      settings.useFakeBob ? "Fake Bob is on: no real Bobcoins are spent." : "",
    ]
      .filter((l) => l !== undefined)
      .join("\n");
    const choice = await vscode.window.showWarningMessage(
      `Send ${findings.length} change${findings.length === 1 ? "" : "s"} to Bob?`,
      { modal: true, detail },
      "Approve and run",
    );
    if (choice !== "Approve and run") return;

    const git = new Git(root);
    if (!(await git.isRepo())) {
      void vscode.window.showErrorMessage("Bob Readiness: the workspace is not a git repository. Bob only works on a new branch.");
      return;
    }
    if (!(await git.isClean())) {
      void vscode.window.showErrorMessage(
        "Bob Readiness: the working tree has uncommitted changes. Commit or stash them first. Bob only starts from a clean tree.",
      );
      return;
    }
    if (await git.branchExists(branch)) {
      void vscode.window.showErrorMessage(`Bob Readiness: branch ${branch} already exists. Wait a minute and try again.`);
      return;
    }

    const base = await git.currentBranch();
    this.run = { branch, base, findings, cost: 0, files: [], canDecide: false, stage: "Creating branch", cancel: new vscode.CancellationTokenSource() };
    this.log.show();
    this.onChange();

    try {
      await git.createBranch(branch);
      this.log.line(`Created branch ${branch}`);

      let notes: string | undefined;
      if (findings.some((f) => f.bob_allowed === "with_notes")) {
        try {
          notes = await fs.readFile(path.join(root, ...ctx.notes_markdown_path.split("/")), "utf8");
          this.log.line(`Bob: reading ${ctx.notes_markdown_path}`);
        } catch {
          this.log.line(`Warning: could not read ${ctx.notes_markdown_path}; sending without study notes`);
        }
      }
      const index = this.store.getIndex()!;
      const prompt = buildBobPrompt(findings, index, notes);
      this.log.line(`Sending ${findings.length} finding${findings.length === 1 ? "" : "s"} to Bob (1 prompt)`);
      this.setStage("Bob is working");

      const result = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Bob Readiness: Bob is working on the branch", cancellable: true },
        (_progress, token) => {
          token.onCancellationRequested(() => this.run?.cancel?.cancel());
          return this.runner.runBob(prompt, root, this.run!.cancel!.token);
        },
      );
      this.run.cost = result.cost;
      this.run.summary = result.summary;

      if (result.cancelled || result.timedOut || !result.ok) {
        this.log.line(`Bob did not finish: ${result.summary}`);
        this.log.line("Discarding the branch");
        await git.discardAndReturn(base);
        this.run = { ...this.run, stage: undefined, error: result.summary, canDecide: false };
        this.onChange();
        void vscode.window.showWarningMessage(`Bob did not finish: ${result.summary}. Back on ${base}, nothing kept.`);
        return;
      }

      this.run.files = await git.diffStat();
      this.log.line(this.run.files.length ? `Changed files: ${this.run.files.map((f) => f.path).join(", ")}` : "Bob changed no files");
      this.setStage("Running tests");
      this.run.tests = "running";
      this.onChange();
      this.run.tests = await runTests(settings.testCommand, root, this.log, this.run.cancel?.token);
      this.run.stage = undefined;
      this.run.canDecide = true;
      this.log.line("Waiting for your decision: Keep or Discard");
      this.onChange();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.line(`Error: ${message}`);
      try {
        if ((await git.currentBranch()) === branch) await git.discardAndReturn(base);
      } catch {
        // leave the tree for the developer to inspect
      }
      this.run = { ...this.run, stage: undefined, error: message, canDecide: false };
      this.onChange();
      void vscode.window.showErrorMessage(`Bob Readiness: ${message}`);
    }
  }

  private async keep(): Promise<void> {
    const run = this.run;
    const root = this.store.workspaceRoot;
    if (!run?.canDecide || !root) return;
    const git = new Git(root);
    try {
      if (run.files.length === 0) {
        this.log.line("Nothing to commit: Bob changed no files. Staying on the branch.");
      } else {
        await git.commitAll(commitMessageFor(run.findings));
        this.log.line(`Committed on ${run.branch}: ${commitMessageFor(run.findings)}`);
      }
      void vscode.window.showInformationMessage(`Kept Bob's changes on ${run.branch}. Review and merge them when ready.`);
    } catch (err) {
      void vscode.window.showErrorMessage(`Bob Readiness: commit failed. ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    await this.finish();
  }

  private async discard(): Promise<void> {
    const run = this.run;
    const root = this.store.workspaceRoot;
    if (!run?.canDecide || !root) return;
    const git = new Git(root);
    try {
      await git.discardAndReturn(run.base);
      this.log.line(`Discarded ${run.branch}. Back on ${run.base}`);
      void vscode.window.showInformationMessage(`Discarded Bob's changes. You are back on ${run.base}.`);
    } catch (err) {
      void vscode.window.showErrorMessage(`Bob Readiness: discard failed. ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    await this.finish();
  }

  private async finish(): Promise<void> {
    this.run?.cancel?.dispose();
    this.run = undefined;
    await this.queue.clear();
    this.onChange();
  }

  private async openDiff(rel: string): Promise<void> {
    const root = this.store.workspaceRoot;
    if (!root || typeof rel !== "string") return;
    const abs = path.join(root, ...rel.split("/"));
    const right = vscode.Uri.file(abs);
    const left = right.with({ scheme: "git", query: JSON.stringify({ path: abs, ref: "HEAD" }) });
    try {
      await vscode.commands.executeCommand("vscode.diff", left, right, `${rel} (HEAD) vs working tree`);
    } catch {
      await vscode.window.showTextDocument(right);
    }
  }

  private setStage(stage: string): void {
    if (this.run) {
      this.run.stage = stage;
      this.onChange();
    }
  }

  private view(): RunView | undefined {
    const r = this.run;
    if (!r) return undefined;
    const tests =
      r.tests === "running"
        ? { kind: "running" as const, title: "Running tests", summary: getSettings().testCommand }
        : r.tests
          ? {
              kind: r.tests.passed ? ("pass" as const) : ("fail" as const),
              title: r.tests.passed ? "Tests passed" : "Tests failed",
              summary: r.tests.summary,
              output: r.tests.passed ? undefined : r.tests.output,
            }
          : undefined;
    const done = r.canDecide ? r.findings.map((f) => `${findingSummaryLine(f)}${f.bob_allowed === "with_notes" ? ", flagged for review" : ""}`) : [];
    if (r.canDecide && r.summary) done.push(`Bob said: ${r.summary}`);
    return {
      title: r.error ? "Bob stopped" : r.canDecide ? "Bob finished" : "Bob is working",
      branch: r.branch,
      costLabel: `${r.cost.toFixed(1)} Bobcoins`,
      stage: r.stage,
      files: r.files,
      tests,
      done,
      error: r.error,
      canDecide: r.canDecide,
    };
  }
}
