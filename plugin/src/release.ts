import * as vscode from "vscode";
import { Git } from "./git";
import type { ContextStore } from "./contextStore";
import type { Log } from "./output";
import type { PanelExtras, PanelMessage } from "./panel/PanelProvider";
import {
  changedFiles,
  changedFunctions,
  computeVerdict,
  groupCommits,
  noteLines,
  notesMarkdown,
  type ChangedFile,
  type ChangedFunction,
  type TestsState,
  type Verdict,
} from "./releaseLogic";
import { getSettings } from "./settings";
import { runTests, type TestOutcome } from "./testRunner";

/** What the Release tab renders. */
export interface ReleaseView {
  sinceLabel: string;
  commitCount: number;
  changedFiles: ChangedFile[];
  changedFunctions: ChangedFunction[];
  verdict: Verdict;
  notes: string[];
  tests?: { kind: "pass" | "fail" | "running"; title: string; summary: string; output?: string };
  error?: string;
}

/** Release tab data: git plus the context file. Recomputed when the tab is shown or the context changes. */
export class ReleaseFeature implements PanelExtras, vscode.Disposable {
  private view: ReleaseView | undefined;
  private notesText = "";
  private tests: TestOutcome | "running" | undefined;
  private computing: Promise<void> | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly store: ContextStore,
    private readonly log: Log,
    private readonly isActive: () => boolean,
    private readonly onChange: () => void,
  ) {
    this.disposables.push(store.onDidChange(() => void this.recompute()));
  }

  extraState(): { release?: ReleaseView } {
    if (!this.view && this.isActive()) void this.recompute();
    return { release: this.view };
  }

  async handle(msg: PanelMessage): Promise<boolean> {
    switch (msg.type) {
      case "setTab":
        if (msg.tab === "release") void this.recompute();
        return false; // the panel still switches the tab
      case "runTests":
        await this.runTests();
        return true;
      case "copyReleaseNotes":
        await vscode.env.clipboard.writeText(this.notesText || "No release notes yet.");
        void vscode.window.showInformationMessage("Release notes copied to the clipboard.");
        return true;
      default:
        return false;
    }
  }

  /** Recompute from git and the context. Safe to call often; concurrent calls share one run. */
  recompute(): Promise<void> {
    if (this.computing) return this.computing;
    this.computing = this.compute().finally(() => {
      this.computing = undefined;
      this.onChange();
    });
    return this.computing;
  }

  private async compute(): Promise<void> {
    const root = this.store.workspaceRoot;
    const index = this.store.getIndex();
    if (!root) {
      this.view = undefined;
      return;
    }
    const git = new Git(root);
    if (!(await git.isRepo())) {
      this.view = errorView("The workspace is not a git repository, so there is nothing to compare.");
      return;
    }
    try {
      const base = await git.releaseBase();
      const subjects = await git.logSince(base.ref);
      const paths = await git.changedFilesSince(base.ref);
      const ranges = await git.changedRangesSince(base.ref);
      const fns = index ? changedFunctions(index, ranges) : [];
      const files = index ? changedFiles(index, paths) : paths.map((p) => ({ path: p, label: p.split("/").pop() ?? p, readiness: 0, known: false }));
      const groups = groupCommits(subjects);
      const testsState: TestsState = this.tests && this.tests !== "running" ? (this.tests.passed ? "passed" : "failed") : "unknown";
      this.notesText = notesMarkdown(groups, base.label, files);
      this.view = {
        sinceLabel: base.label,
        commitCount: subjects.length,
        changedFiles: files,
        changedFunctions: fns,
        verdict: computeVerdict(fns, testsState),
        notes: noteLines(groups),
        tests: this.testsView(),
      };
    } catch (err) {
      this.view = errorView(`Could not read git history: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async runTests(): Promise<void> {
    const root = this.store.workspaceRoot;
    if (!root || this.tests === "running") return;
    this.tests = "running";
    if (this.view) this.view.tests = this.testsView();
    this.onChange();
    this.log.show();
    this.tests = await runTests(getSettings().testCommand, root, this.log);
    await this.recompute();
  }

  private testsView(): ReleaseView["tests"] {
    if (!this.tests) return undefined;
    if (this.tests === "running") return { kind: "running", title: "Running tests", summary: getSettings().testCommand };
    return {
      kind: this.tests.passed ? "pass" : "fail",
      title: this.tests.passed ? "Tests passed" : "Tests failed",
      summary: this.tests.summary,
      output: this.tests.passed ? undefined : this.tests.output,
    };
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}

function errorView(error: string): ReleaseView {
  return {
    sinceLabel: "",
    commitCount: 0,
    changedFiles: [],
    changedFunctions: [],
    verdict: { kind: "check", title: "Ready, with items to check", reason: error },
    notes: [],
    error,
  };
}
