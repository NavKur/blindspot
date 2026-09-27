import * as vscode from "vscode";
import type { ContextStore } from "./contextStore";
import type { ReportStore } from "./report/reportStore";
import { pct } from "./report/reportLogic";

/**
 * A status bar warning while a risky file is active: "Bob was confidently wrong here N times".
 * Shows at the moment of risk, before the developer opens Bob's chat. Click for the details
 * and a one click "Copy context for this file".
 */
export class ActiveFileWarning implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem("bobReadiness.fileWarning", vscode.StatusBarAlignment.Left, 99);
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly store: ContextStore,
    private readonly reports: ReportStore,
  ) {
    this.item.name = "Bob Readiness file warning";
    this.item.command = "bobReadiness.explainFile";
    this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
    this.disposables.push(
      this.item,
      vscode.window.onDidChangeActiveTextEditor(() => this.refresh()),
      store.onDidChange(() => this.refresh()),
      reports.onDidChange(() => this.refresh()),
    );
    this.refresh();
  }

  refresh(): void {
    const editor = vscode.window.activeTextEditor;
    const summary = editor ? this.summarize(editor.document.uri) : undefined;
    if (!summary) {
      this.item.hide();
      return;
    }
    this.item.text = `$(warning) ${summary.text}`;
    this.item.tooltip = summary.tooltip;
    this.item.show();
  }

  /** Short text and tooltip when the file is risky, otherwise undefined. */
  summarize(uri: vscode.Uri): { text: string; tooltip: string } | undefined {
    const relContext = this.store.relativePath(uri);
    const relReport = this.reports.relativePath(uri);
    const module = relReport ? this.reports.moduleForPath(relReport) : undefined;
    const wrong = relContext ? this.store.functionsForFile(relContext).filter((f) => f.status === "wrong") : [];
    const cwCount = module?.cw_count ?? 0;
    const reasons: string[] = [];
    if (module?.red) reasons.push(`red module: ${module.red_reasons.join("; ")}`);
    if (wrong.length) reasons.push(`sure but wrong: ${wrong.map((f) => f.name).join(", ")}`);
    if (module && !module.red && cwCount > 0) reasons.push(`confidently wrong ${cwCount} time${cwCount === 1 ? "" : "s"} in the exam`);
    if (reasons.length === 0) return undefined;
    const count = Math.max(cwCount, wrong.reduce((n, f) => n + Math.max(1, f.misconceptions.length), 0));
    const text = module?.red || wrong.length ? `Bob: confidently wrong here ${count} time${count === 1 ? "" : "s"}` : `Bob: ${cwCount} confidently wrong`;
    const tooltip =
      `${uri.fsPath.split("/").pop()}: ${reasons.join(". ")}.` +
      (module ? ` Exam accuracy ${pct(module.accuracy)} on ${module.n} questions.` : "") +
      " Click for details and to copy context for Bob.";
    return { text, tooltip };
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
