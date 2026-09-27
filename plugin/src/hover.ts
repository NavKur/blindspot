import * as vscode from "vscode";
import type { ContextStore } from "./contextStore";
import type { HighlightState } from "./highlightState";
import { hoverMarkdownForLine } from "./hoverText";
import type { Queue } from "./queue";

export const HOVER_COMMANDS = ["bobReadiness.queueFinding", "bobReadiness.openFinding"];

/** Hover cards on highlighted lines. Only active while highlights are on. */
export class ReadinessHoverProvider implements vscode.HoverProvider {
  constructor(
    private readonly store: ContextStore,
    private readonly state: HighlightState,
    private readonly queue: Queue,
  ) {}

  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
    if (!this.state.isOn) return undefined;
    const index = this.store.getIndex();
    const relPath = this.store.relativePath(document.uri);
    if (!index || !relPath) return undefined;
    const markdown = hoverMarkdownForLine(index, relPath, position.line + 1, { queued: this.queue.selected });
    if (!markdown) return undefined;
    const md = new vscode.MarkdownString(markdown);
    md.supportHtml = true;
    md.isTrusted = { enabledCommands: HOVER_COMMANDS };
    return new vscode.Hover(md, document.lineAt(position.line).range);
  }
}

export function registerHover(store: ContextStore, state: HighlightState, queue: Queue): vscode.Disposable {
  return vscode.languages.registerHoverProvider(
    { scheme: "file" },
    new ReadinessHoverProvider(store, state, queue),
  );
}
