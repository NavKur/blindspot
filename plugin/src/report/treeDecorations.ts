import * as vscode from "vscode";
import type { ReportStore } from "./reportStore";
import { treeDecoration } from "./reportLogic";

/** Colours and badges in the Explorer from the report: red badge, heat colour, few answers marker. */
export class ReportTreeDecorations implements vscode.FileDecorationProvider, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
  readonly onDidChangeFileDecorations = this.emitter.event;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly store: ReportStore) {
    this.disposables.push(
      store.onDidChange(() => this.emitter.fire(undefined)),
      vscode.window.registerFileDecorationProvider(this),
    );
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    const rel = this.store.relativePath(uri);
    if (rel === undefined || rel === "") return undefined;
    const module = this.store.moduleForPath(rel);
    const node = module ?? this.store.directoryForPath(rel);
    if (!node) return undefined; // not examined: neutral
    const spec = treeDecoration(node, module ? "module" : "folder");
    const decoration = new vscode.FileDecoration(spec.badge, spec.tooltip, new vscode.ThemeColor(spec.colorId));
    decoration.propagate = false;
    return decoration;
  }

  dispose(): void {
    this.emitter.dispose();
    for (const d of this.disposables) d.dispose();
  }
}
