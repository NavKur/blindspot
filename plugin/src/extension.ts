import * as vscode from "vscode";
import { Approval } from "./approval";
import { BobRunner } from "./bobRunner";
import { registerCodeLens } from "./codelens";
import { registerCommands } from "./commands";
import { ContextStore } from "./contextStore";
import { Decorations } from "./decorations";
import { Diagnostics } from "./diagnostics";
import { HighlightState } from "./highlightState";
import { OnboardingFeature } from "./onboarding";
import { Log } from "./output";
import { registerHover } from "./hover";
import { PanelProvider } from "./panel/PanelProvider";
import { Queue } from "./queue";
import { ExamFeature } from "./report/examFeature";
import { ReportStore } from "./report/reportStore";
import { ReportTreeDecorations } from "./report/treeDecorations";
import { ReleaseFeature } from "./release";
import { SessionCoins } from "./session";
import { StatusBar } from "./statusBar";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const store = new ContextStore();
  const state = new HighlightState(context.workspaceState);
  const session = new SessionCoins();
  const queue = new Queue(context.workspaceState, store);
  const reports = new ReportStore();

  context.subscriptions.push(
    store,
    state,
    session,
    queue,
    new Decorations(store, state, context.extensionUri),
    new Diagnostics(store, state),
    new StatusBar(store, state, session, reports),
    reports,
    new ReportTreeDecorations(reports),
    registerHover(store, state, queue),
    registerCodeLens(store, state, queue),
  );
  registerCommands(context, store, state, queue);

  const panel = new PanelProvider(context.extensionUri, context.workspaceState, store, queue, session);
  context.subscriptions.push(
    panel,
    vscode.window.registerWebviewViewProvider(PanelProvider.viewType, panel, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  const log = new Log();
  const runner = new BobRunner(context.extensionPath, log, session);
  const approval = new Approval(store, queue, runner, log, () => {
    panel.refresh();
    // After Keep or Discard the git history changed, so the Release tab is stale.
    if (!approval.busy) void release.recompute();
  });
  const release = new ReleaseFeature(store, log, () => panel.currentTab === "release", () => panel.refresh());
  const onboarding = new OnboardingFeature(context.workspaceState, store, runner, log, () => panel.refresh());
  const exam = new ExamFeature(reports, log, () => panel.refresh());
  panel.addExtras(approval);
  panel.addExtras(release);
  panel.addExtras(onboarding);
  panel.addExtras(exam);
  context.subscriptions.push(
    exam,
    vscode.commands.registerCommand("bobReadiness.openExam", () => panel.reveal("exam")),
    vscode.commands.registerCommand("bobReadiness.reloadReport", () => reports.load()),
  );
  context.subscriptions.push(release);
  context.subscriptions.push(
    log,
    vscode.commands.registerCommand("bobReadiness.sendToBob", () => approval.sendToBob()),
  );

  await Promise.all([store.load(), reports.load()]);
}

export function deactivate(): void {
  // Everything is disposed through context.subscriptions.
}
