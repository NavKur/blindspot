import * as vscode from "vscode";
import { percent } from "./contract";
import type { ContextStore } from "./contextStore";
import type { HighlightState } from "./highlightState";
import type { SessionCoins } from "./session";

/** Left: the toggle. Right: overall readiness and Bobcoins spent this session. */
export class StatusBar implements vscode.Disposable {
  private readonly toggle = vscode.window.createStatusBarItem("bobReadiness.toggle", vscode.StatusBarAlignment.Left, 100);
  private readonly readiness = vscode.window.createStatusBarItem("bobReadiness.readiness", vscode.StatusBarAlignment.Right, 101);
  private readonly coins = vscode.window.createStatusBarItem("bobReadiness.coins", vscode.StatusBarAlignment.Right, 100);
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly store: ContextStore,
    private readonly state: HighlightState,
    private readonly session: SessionCoins,
  ) {
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
    this.coins.text = `Bobcoins this session ${this.session.spent.toFixed(1)}`;
    this.coins.tooltip = "Bobcoins spent by this extension since the IDE opened.";
    this.coins.show();
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
