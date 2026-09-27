import * as vscode from "vscode";
import { percent, statusLabel } from "./contract";
import type { ContextStore } from "./contextStore";
import type { HighlightState } from "./highlightState";
import type { Queue } from "./queue";

/** Open a context relative file at a 1-based line, selecting that line. */
export async function openFileAtLine(store: ContextStore, relPath: string, line: number): Promise<void> {
  const abs = store.absolutePath(relPath);
  if (!abs) return;
  try {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(abs));
    const editor = await vscode.window.showTextDocument(doc, { preview: false });
    const target = Math.min(Math.max(line, 1), doc.lineCount) - 1;
    const range = doc.lineAt(target).range;
    editor.selection = new vscode.Selection(range.start, range.start);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
  } catch {
    void vscode.window.showWarningMessage(`Bob Readiness: could not open ${relPath}.`);
  }
}

/** Plain text explanation of why Bob is unsure about a function, for the "Why Bob is unsure" lens. */
export function whyUnsureText(store: ContextStore, functionId: string): string | undefined {
  const index = store.getIndex();
  const fn = index?.functionById(functionId);
  if (!index || !fn) return undefined;
  const parts = [`${fn.name}: readiness ${percent(fn.readiness)}, ${statusLabel(fn.status)}, ${fn.tested ? "tested" : "not tested"}.`];
  for (const m of fn.misconceptions) {
    parts.push(`Bob was ${percent(m.confidence)} sure that ${m.believed}. Actually: ${m.truth}.`);
  }
  for (const f of index.findingsForFunction(fn.id)) {
    parts.push(`${f.id} (${f.severity}): ${f.title}. ${f.recommendation}`);
  }
  return parts.join(" ");
}

export function registerCommands(
  context: vscode.ExtensionContext,
  store: ContextStore,
  state: HighlightState,
  queue: Queue,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("bobReadiness.hello", () => {
      void vscode.window.showInformationMessage("Bob Readiness is running");
    }),
    vscode.commands.registerCommand("bobReadiness.toggleHighlights", () => state.toggle()),
    vscode.commands.registerCommand("bobReadiness.reload", async () => {
      const ok = await store.load();
      if (ok) void vscode.window.showInformationMessage("Bob Readiness: context reloaded.");
      else if (!store.getContext()) {
        void vscode.window.showWarningMessage(`Bob Readiness: no context file at ${store.contextFilePath ?? "(no workspace)"}.`);
      }
    }),
    vscode.commands.registerCommand("bobReadiness.queueFinding", (id: string) => queue.toggle(id)),
    vscode.commands.registerCommand("bobReadiness.queueFunction", async (functionId: string) => {
      const findings = store.getIndex()?.findingsForFunction(functionId) ?? [];
      const ids = findings.map((f) => f.id);
      const allQueued = ids.length > 0 && ids.every((id) => queue.has(id) || store.findingById(id)?.bob_allowed === "no");
      await queue.setMany(ids, !allQueued);
    }),
    vscode.commands.registerCommand("bobReadiness.whyUnsure", (functionId: string) => {
      const text = whyUnsureText(store, functionId);
      if (text) void vscode.window.showInformationMessage(text, { modal: false });
    }),
    vscode.commands.registerCommand("bobReadiness.openFinding", async (id: string) => {
      const finding = store.findingById(id);
      if (finding) await openFileAtLine(store, finding.file, finding.line_start);
    }),
    vscode.commands.registerCommand("bobReadiness.openFile", (relPath: string, line = 1) =>
      openFileAtLine(store, relPath, line),
    ),
    vscode.commands.registerCommand("bobReadiness.openPanel", () =>
      vscode.commands.executeCommand("workbench.view.extension.bobReadiness"),
    ),
  );
}
