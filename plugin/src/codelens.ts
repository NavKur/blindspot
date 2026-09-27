import * as vscode from "vscode";
import { lensesForFunction } from "./codelensText";
import type { ContextStore } from "./contextStore";
import type { HighlightState } from "./highlightState";
import type { Queue } from "./queue";

/** "Add to Bob queue (N)" and "Why Bob is unsure" above functions with findings. */
export class ReadinessCodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.emitter.event;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly store: ContextStore,
    private readonly state: HighlightState,
    queue: Queue,
  ) {
    this.disposables.push(
      store.onDidChange(() => this.emitter.fire()),
      state.onDidChange(() => this.emitter.fire()),
      queue.onDidChange(() => this.emitter.fire()),
    );
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!this.state.isOn) return [];
    const index = this.store.getIndex();
    const relPath = this.store.relativePath(document.uri);
    if (!index || !relPath) return [];
    const lenses: vscode.CodeLens[] = [];
    for (const fn of index.functionsForFile(relPath)) {
      const findings = index.findingsForFunction(fn.id);
      if (findings.length === 0 || fn.line_start > document.lineCount) continue;
      const range = document.lineAt(fn.line_start - 1).range;
      for (const lens of lensesForFunction(fn, findings)) {
        lenses.push(new vscode.CodeLens(range, { title: lens.title, command: lens.command, arguments: lens.args }));
      }
    }
    return lenses;
  }

  dispose(): void {
    this.emitter.dispose();
    for (const d of this.disposables) d.dispose();
  }
}

export function registerCodeLens(store: ContextStore, state: HighlightState, queue: Queue): vscode.Disposable {
  const provider = new ReadinessCodeLensProvider(store, state, queue);
  const registration = vscode.languages.registerCodeLensProvider({ scheme: "file" }, provider);
  return vscode.Disposable.from(provider, registration);
}
