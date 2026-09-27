import * as vscode from "vscode";
import type { ContextStore } from "./contextStore";
import { fileContextText } from "./fileContext";
import type { Queue } from "./queue";
import type { ReportStore } from "./report/reportStore";
import { pct } from "./report/reportLogic";
import { percent } from "./contract";

/** The file the command was invoked on: an explorer uri, or the active editor. */
function targetUri(arg: unknown): vscode.Uri | undefined {
  if (arg instanceof vscode.Uri) return arg;
  return vscode.window.activeTextEditor?.document.uri;
}

/** Copy a prompt preamble about one file to the clipboard. Returns the text (for tests and messages). */
export async function copyFileContext(store: ContextStore, reports: ReportStore, arg?: unknown): Promise<string | undefined> {
  const uri = targetUri(arg);
  if (!uri) {
    void vscode.window.showInformationMessage("Open a file first.");
    return undefined;
  }
  const rel = store.relativePath(uri) ?? reports.relativePath(uri);
  if (!rel) {
    void vscode.window.showInformationMessage("This file is outside the examined repository.");
    return undefined;
  }
  const notes = await store.readNotes();
  const text = fileContextText({ relPath: rel, index: store.getIndex(), module: reports.moduleForPath(rel), notes });
  await vscode.env.clipboard.writeText(text);
  void vscode.window.showInformationMessage(`Copied Bob context for ${rel.split("/").pop()}. Paste it at the start of your Bob prompt.`);
  return text;
}

/** Queue every allowed finding in one file. Returns how many are now queued. */
export async function queueFile(store: ContextStore, queue: Queue, arg?: unknown): Promise<number> {
  const uri = targetUri(arg);
  const rel = uri ? store.relativePath(uri) : undefined;
  if (!rel) {
    void vscode.window.showInformationMessage("Open a file from the examined repository first.");
    return 0;
  }
  const findings = store.findingsForFile(rel);
  const allowed = findings.filter((f) => f.bob_allowed !== "no");
  const blocked = findings.length - allowed.length;
  await queue.setMany(allowed.map((f) => f.id), true);
  const name = rel.split("/").pop();
  if (allowed.length === 0) {
    void vscode.window.showInformationMessage(blocked ? `${name}: ${blocked} finding${blocked === 1 ? "" : "s"} here need a person. Nothing to send to Bob.` : `${name}: no findings.`);
  } else {
    void vscode.window.showInformationMessage(
      `${name}: ${allowed.length} finding${allowed.length === 1 ? "" : "s"} added to the Bob queue${blocked ? `, ${blocked} need a person` : ""}. Open the panel to send.`,
    );
  }
  return allowed.length;
}

/** Plain English explanation of why a file is risky, with a copy context button. */
export async function explainFile(store: ContextStore, reports: ReportStore, arg?: unknown): Promise<void> {
  const uri = targetUri(arg);
  if (!uri) return;
  const rel = store.relativePath(uri) ?? reports.relativePath(uri);
  if (!rel) return;
  const module = reports.moduleForPath(rel);
  const fns = store.functionsForFile(rel);
  const wrong = fns.filter((f) => f.status === "wrong");
  const parts: string[] = [];
  if (module) {
    parts.push(`Exam: accuracy ${pct(module.accuracy)} on ${module.n} questions, confidently wrong ${module.cw_count} time${module.cw_count === 1 ? "" : "s"}${module.red ? `. Red: ${module.red_reasons.join("; ")}` : ""}.`);
  }
  for (const fn of wrong) {
    for (const m of fn.misconceptions) parts.push(`${fn.name}: Bob was ${percent(m.confidence)} sure that ${m.believed}. Actually: ${m.truth}.`);
  }
  if (parts.length === 0) parts.push("Nothing risky recorded for this file.");
  const choice = await vscode.window.showInformationMessage(parts.join("\n"), { modal: true, detail: "Paste the context into your Bob prompt so Bob does not repeat these mistakes." }, "Copy context for this file", "Open Exam tab");
  if (choice === "Copy context for this file") await copyFileContext(store, reports, uri);
  else if (choice === "Open Exam tab") await vscode.commands.executeCommand("bobReadiness.openExam");
}
