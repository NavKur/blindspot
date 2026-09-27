import * as vscode from "vscode";
import { describeContextChange, describeReportChange } from "./changes";
import type { ContextStore } from "./contextStore";
import type { Log } from "./output";
import type { ReportStore } from "./report/reportStore";

/** Toasts when the engine regenerates the context or the report, so the plugin is a feedback loop. */
export function watchUpdates(store: ContextStore, reports: ReportStore, log: Log): vscode.Disposable {
  const a = store.onDidReload(({ previous, current }) => {
    const text = describeContextChange(previous, current);
    if (!text) return;
    log.line(text);
    void vscode.window.showInformationMessage(text, "Show heatmap").then((choice) => {
      if (choice) void vscode.commands.executeCommand("bobReadiness.openHeatmap");
    });
  });
  const b = reports.onDidReload(({ previous, current }) => {
    const text = describeReportChange(previous, current);
    if (!text) return;
    log.line(text);
    void vscode.window.showInformationMessage(text, "Open Exam tab").then((choice) => {
      if (choice) void vscode.commands.executeCommand("bobReadiness.openExam");
    });
  });
  return vscode.Disposable.from(a, b);
}
