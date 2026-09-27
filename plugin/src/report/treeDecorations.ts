import * as vscode from "vscode";
import type { ContextStore } from "../contextStore";
import { percent } from "../contract";
import type { ReportStore } from "./reportStore";
import { HEAT_COLOR_IDS, treeDecoration } from "./reportLogic";

/** Colours and badges in the Explorer from the report: red badge, heat colour, few answers marker. */
export class ReportTreeDecorations implements vscode.FileDecorationProvider, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
  readonly onDidChangeFileDecorations = this.emitter.event;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly store: ReportStore,
    private readonly context?: ContextStore,
  ) {
    if (context) this.disposables.push(context.onDidChange(() => this.emitter.fire(undefined)));
    this.disposables.push(
      store.onDidChange(() => this.emitter.fire(undefined)),
      vscode.window.registerFileDecorationProvider(this),
    );
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    const rel = this.store.relativePath(uri) ?? this.context?.relativePath(uri);
    if (rel === undefined || rel === "") return undefined;
    const module = this.store.moduleForPath(rel);
    const node = module ?? this.store.directoryForPath(rel);
    if (!node) return this.fromContext(rel); // no exam entry: try the readiness context, else neutral
    const spec = treeDecoration(node, module ? "module" : "folder");
    const decoration = new vscode.FileDecoration(spec.badge, spec.tooltip, new vscode.ThemeColor(spec.colorId));
    decoration.propagate = false;
    return decoration;
  }

  /** Trust colour from the readiness context's files[] when the exam has no entry for the file. */
  private fromContext(rel: string): vscode.FileDecoration | undefined {
    const ctx = this.context?.getContext();
    const file = ctx?.files.find((f) => f.path === rel);
    if (!file) return undefined;
    const wrong = this.context!.functionsForFile(rel).filter((f) => f.status === "wrong").length;
    const colorId = file.status === "ready" ? HEAT_COLOR_IDS[0] : file.status === "review" ? HEAT_COLOR_IDS[2] : HEAT_COLOR_IDS[4];
    const tooltip = `Bob readiness ${percent(file.readiness)}, ${file.status.replace("_", " ")}${wrong ? `, ${wrong} sure but wrong function${wrong === 1 ? "" : "s"}` : ""}`;
    const decoration = new vscode.FileDecoration(wrong ? "!" : undefined, tooltip, new vscode.ThemeColor(colorId));
    decoration.propagate = false;
    return decoration;
  }

  dispose(): void {
    this.emitter.dispose();
    for (const d of this.disposables) d.dispose();
  }
}
