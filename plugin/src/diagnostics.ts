import * as vscode from "vscode";
import { findingTypeLabel } from "./contract";
import type { ContextStore } from "./contextStore";
import type { HighlightState } from "./highlightState";
import { severityToLevel, type DiagnosticLevel } from "./ranges";

const LEVELS: Record<DiagnosticLevel, vscode.DiagnosticSeverity> = {
  warning: vscode.DiagnosticSeverity.Warning,
  information: vscode.DiagnosticSeverity.Information,
  hint: vscode.DiagnosticSeverity.Hint,
};

/** One Problems panel entry per finding. Follows the highlight toggle. */
export class Diagnostics implements vscode.Disposable {
  private readonly collection = vscode.languages.createDiagnosticCollection("Bob Readiness");
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly store: ContextStore, private readonly state: HighlightState) {
    this.disposables.push(
      this.collection,
      store.onDidChange(() => this.refresh()),
      state.onDidChange(() => this.refresh()),
    );
    this.refresh();
  }

  refresh(): void {
    this.collection.clear();
    const ctx = this.store.getContext();
    if (!this.state.isOn || !ctx) return;
    const byFile = new Map<string, vscode.Diagnostic[]>();
    for (const finding of ctx.findings) {
      const abs = this.store.absolutePath(finding.file);
      if (!abs) continue;
      const range = new vscode.Range(finding.line_start - 1, 0, finding.line_end - 1, Number.MAX_SAFE_INTEGER);
      const diagnostic = new vscode.Diagnostic(
        range,
        `${finding.title}. ${finding.recommendation}`,
        LEVELS[severityToLevel(finding.severity)],
      );
      diagnostic.source = "Bob Readiness";
      diagnostic.code = `${finding.id} ${findingTypeLabel(finding.type)}`;
      const list = byFile.get(abs) ?? [];
      list.push(diagnostic);
      byFile.set(abs, list);
    }
    for (const [file, list] of byFile) this.collection.set(vscode.Uri.file(file), list);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
