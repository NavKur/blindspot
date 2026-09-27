import * as vscode from "vscode";
import type { ContextStore } from "./contextStore";
import type { Queue } from "./queue";

/**
 * Quick fixes on the Problems panel entries: add the finding to the Bob queue, open the study
 * notes, copy context for the file. The developer never has to open the side panel.
 */
export class ReadinessCodeActionProvider implements vscode.CodeActionProvider {
  static readonly kinds = [vscode.CodeActionKind.QuickFix];

  constructor(
    private readonly store: ContextStore,
    private readonly queue: Queue,
  ) {}

  provideCodeActions(document: vscode.TextDocument, _range: vscode.Range, context: vscode.CodeActionContext): vscode.CodeAction[] {
    const ours = context.diagnostics.filter((d) => d.source === "Bob Readiness");
    if (ours.length === 0) return [];
    const actions: vscode.CodeAction[] = [];
    for (const diagnostic of ours) {
      const id = String(diagnostic.code ?? "").split(" ")[0];
      const finding = this.store.findingById(id);
      if (!finding) continue;
      if (finding.bob_allowed !== "no") {
        const queued = this.queue.has(finding.id);
        const action = new vscode.CodeAction(queued ? `Remove ${finding.id} from Bob queue` : `Add ${finding.id} to Bob queue`, vscode.CodeActionKind.QuickFix);
        action.command = { command: "bobReadiness.queueFinding", title: action.title, arguments: [finding.id] };
        action.diagnostics = [diagnostic];
        action.isPreferred = !queued;
        actions.push(action);
      } else {
        const action = new vscode.CodeAction(`${finding.id} needs a person: show why`, vscode.CodeActionKind.QuickFix);
        action.command = { command: "bobReadiness.whyUnsure", title: action.title, arguments: [finding.function_id] };
        action.diagnostics = [diagnostic];
        actions.push(action);
      }
    }
    const notes = new vscode.CodeAction("Open Bob study notes", vscode.CodeActionKind.QuickFix);
    notes.command = { command: "bobReadiness.openNotes", title: notes.title };
    actions.push(notes);
    const copy = new vscode.CodeAction("Copy Bob context for this file", vscode.CodeActionKind.QuickFix);
    copy.command = { command: "bobReadiness.copyFileContext", title: copy.title, arguments: [document.uri] };
    actions.push(copy);
    return actions;
  }
}

export function registerCodeActions(store: ContextStore, queue: Queue): vscode.Disposable {
  return vscode.languages.registerCodeActionsProvider({ scheme: "file" }, new ReadinessCodeActionProvider(store, queue), {
    providedCodeActionKinds: ReadinessCodeActionProvider.kinds,
  });
}
