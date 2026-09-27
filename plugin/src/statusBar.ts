import * as vscode from "vscode";
import { percent } from "./contract";
import type { ContextStore } from "./contextStore";
import type { HighlightState } from "./highlightState";
import type { ReportStore } from "./report/reportStore";
import { pct } from "./report/reportLogic";
import type { SessionCoins } from "./session";

/** Left: the toggle. Right: overall readiness and Bobcoins spent this session. */
export class StatusBar implements vscode.Disposable {
  private readonly toggle = vscode.window.createStatusBarItem("bobReadiness.toggle", vscode.StatusBarAlignment.Left, 100);
  private readonly readiness = vscode.window.createStatusBarItem("bobReadiness.readiness", vscode.StatusBarAlignment.Right, 101);
  private readonly coins = vscode.window.createStatusBarItem("bobReadiness.coins", vscode.StatusBarAlignment.Right, 100);
  private readonly exam = vscode.window.createStatusBarItem("bobReadiness.exam", vscode.StatusBarAlignment.Right, 102);
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly store: ContextStore,
    private readonly state: HighlightState,
    private readonly session: SessionCoins,
    private readonly reports?: ReportStore,
  ) {
    this.exam.name = "Blindspot exam";
    this.exam.command = "bobReadiness.openExam";
    if (reports) this.disposables.push(reports.onDidChange(() => this.refresh()));
    this.toggle.name = "Bob Readiness toggle";
    this.toggle.command = "bobReadiness.toggleHighlights";
    this.readiness.name = "Bob Readiness";
    this.readiness.command = "bobReadiness.openPanel";
    this.coins.name = "Bobcoins this session";
    this.coins.command = "bobReadiness.openPanel";
    this.disposables.push(
      this.toggle,
      this.readiness,
      this.coins,
      this.exam,
      store.onDidChange(() => this.refresh()),
      state.onDidChange(() => this.refresh()),
      session.onDidChange(() => this.refresh()),
    );
    this.refresh();
  }

  refresh(): void {
    const on = this.state.isOn;
    this.toggle.text = on ? "$(eye) Readiness: On" : "$(eye-closed) Readiness: Off";
    this.toggle.tooltip = on
      ? "Bob Readiness highlights are on. Click to hide highlights, hovers, CodeLens and Problems entries."
      : "Bob Readiness highlights are off. Click to show them.";
    this.toggle.show();

    const ctx = this.store.getContext();
    if (ctx) {
      this.readiness.text = `Bob Readiness ${percent(ctx.summary.readiness)}`;
      this.readiness.tooltip = `${ctx.repo.name}: Bob answered ${ctx.summary.questions} questions, ${ctx.summary.sure_but_wrong} sure but wrong.`;
      this.readiness.show();
    } else {
      this.readiness.hide();
    }
    const report = this.reports?.getReport();
    if (report) {
      this.exam.text = `$(beaker) Blindspot ${pct(report.overall.accuracy)} ${report.run.condition}${report.simulated ? " (simulated)" : ""}`;
      this.exam.tooltip = `${report.run.name}: accuracy ${pct(report.overall.accuracy)}, confidently wrong ${pct(report.overall.cw_rate)}, ${report.red_modules.length} red module${report.red_modules.length === 1 ? "" : "s"}. Click to open the Exam tab.`;
      this.exam.show();
    } else {
      this.exam.hide();
    }
    this.coins.text = `Bobcoins this session ${this.session.spent.toFixed(1)}`;
    this.coins.tooltip = "Bobcoins spent by this extension since the IDE opened.";
    this.coins.show();
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
