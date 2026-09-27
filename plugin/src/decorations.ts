import * as vscode from "vscode";
import type { ContextStore } from "./contextStore";
import type { HighlightState } from "./highlightState";
import { clampRange, decorationRangesForFile, type LineRange } from "./ranges";

/** Line highlights, gutter dots and the dimmed inline hint, applied to every visible editor. */
export class Decorations implements vscode.Disposable {
  private readonly wrong: vscode.TextEditorDecorationType;
  private readonly part: vscode.TextEditorDecorationType;
  private readonly finding: vscode.TextEditorDecorationType;
  private readonly hint: vscode.TextEditorDecorationType;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly store: ContextStore,
    private readonly state: HighlightState,
    extensionUri: vscode.Uri,
  ) {
    this.wrong = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: "rgba(250,77,86,0.14)",
      borderWidth: "0 0 0 3px",
      borderStyle: "solid",
      borderColor: "#fa4d56",
      overviewRulerColor: "rgba(250,77,86,0.6)",
      overviewRulerLane: vscode.OverviewRulerLane.Left,
    });
    this.part = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: "rgba(69,137,255,0.10)",
      borderWidth: "0 0 0 3px",
      borderStyle: "solid",
      borderColor: "#4589ff",
      overviewRulerColor: "rgba(69,137,255,0.6)",
      overviewRulerLane: vscode.OverviewRulerLane.Left,
    });
    this.finding = vscode.window.createTextEditorDecorationType({
      gutterIconPath: vscode.Uri.joinPath(extensionUri, "media", "finding.svg"),
      gutterIconSize: "contain",
      overviewRulerColor: "#f1c21b",
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    });
    this.hint = vscode.window.createTextEditorDecorationType({
      after: {
        color: new vscode.ThemeColor("editorCodeLens.foreground"),
        fontStyle: "italic",
        margin: "0 0 0 2em",
      },
    });

    this.disposables.push(
      this.wrong,
      this.part,
      this.finding,
      this.hint,
      vscode.window.onDidChangeVisibleTextEditors(() => this.refreshAll()),
      vscode.workspace.onDidChangeTextDocument((e) => this.refreshDocument(e.document)),
      store.onDidChange(() => this.refreshAll()),
      state.onDidChange(() => this.refreshAll()),
    );
    this.refreshAll();
  }

  refreshAll(): void {
    for (const editor of vscode.window.visibleTextEditors) this.apply(editor);
  }

  private refreshDocument(doc: vscode.TextDocument): void {
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document === doc) this.apply(editor);
    }
  }

  private apply(editor: vscode.TextEditor): void {
    const index = this.store.getIndex();
    const relPath = this.store.relativePath(editor.document.uri);
    if (!this.state.isOn || !index || !relPath) {
      this.clear(editor);
      return;
    }
    const ranges = decorationRangesForFile(index, relPath);
    if (ranges.wrong.length + ranges.part.length + ranges.finding.length === 0) {
      this.clear(editor);
      return;
    }
    const lineCount = editor.document.lineCount;
    editor.setDecorations(this.wrong, toVsRanges(ranges.wrong, lineCount));
    editor.setDecorations(this.part, toVsRanges(ranges.part, lineCount));
    editor.setDecorations(this.finding, toVsRanges(ranges.finding, lineCount));
    editor.setDecorations(
      this.hint,
      ranges.hints
        .filter((h) => h.line >= 1 && h.line <= lineCount)
        .map((h) => {
          const line = editor.document.lineAt(h.line - 1);
          return {
            range: new vscode.Range(line.range.end, line.range.end),
            renderOptions: { after: { contentText: h.text } },
          } satisfies vscode.DecorationOptions;
        }),
    );
  }

  private clear(editor: vscode.TextEditor): void {
    editor.setDecorations(this.wrong, []);
    editor.setDecorations(this.part, []);
    editor.setDecorations(this.finding, []);
    editor.setDecorations(this.hint, []);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}

function toVsRanges(ranges: LineRange[], lineCount: number): vscode.Range[] {
  const out: vscode.Range[] = [];
  for (const r of ranges) {
    const c = clampRange(r, lineCount);
    if (c) out.push(new vscode.Range(c.startLine - 1, 0, c.endLine - 1, Number.MAX_SAFE_INTEGER));
  }
  return out;
}
