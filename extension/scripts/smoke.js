#!/usr/bin/env node
/*
 * smoke.js: loads the bundled extension (dist/extension.js) against a small stub of the VS Code
 * API and drives the whole flow with fake Bob in a throwaway copy of ../demo-tinydb:
 * activation, panel state, queue, onboarding chat with cache, approve + keep, approve + discard,
 * and the dirty tree refusal. Run: npm run smoke (after npm run build). Exit code 0 means pass.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");
const { execFileSync } = require("child_process");

const extRoot = path.resolve(__dirname, "..");
const demo = path.resolve(extRoot, "..", "demo-tinydb");
if (!fs.existsSync(path.join(demo, ".bob", "context", "readiness.json"))) {
  console.error("demo workspace missing at " + demo + ". See README.md.");
  process.exit(2);
}
const root = fs.mkdtempSync(path.join(os.tmpdir(), "bob-readiness-smoke-"));
const git = (args, cwd = root) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
// Copy the demo repo without its virtualenv, keep git history.
execFileSync("rsync", ["-a", "--exclude", ".venv", demo + "/", root + "/"]);
git(["config", "user.email", "smoke@test"]);
git(["config", "user.name", "smoke"]);
if (git(["status", "--porcelain"])) { git(["add", "-A"]); git(["commit", "-q", "-m", "chore: smoke baseline"]); }
const venvPython = path.join(demo, ".venv", "bin", "python");
const testCommand = fs.existsSync(venvPython) ? `PYTHONPATH=. ${venvPython} -m pytest -q -x` : "true";

// ---------- vscode stub ----------
const messages = { info: [], warn: [], error: [] };
let modalAnswer = "Approve and run";
class Disposable { constructor(fn) { this.fn = fn; } dispose() { if (this.fn) this.fn(); } static from(...ds) { return new Disposable(() => ds.forEach((d) => d.dispose())); } }
class EventEmitter { constructor() { this.ls = []; this.event = (l) => { this.ls.push(l); return new Disposable(() => { this.ls = this.ls.filter((x) => x !== l); }); }; } fire(e) { for (const l of [...this.ls]) l(e); } dispose() { this.ls = []; } }
class Uri {
  constructor(fsPath, scheme = "file", query = "") { this.fsPath = fsPath; this.scheme = scheme; this.query = query; this.path = fsPath; }
  static file(p) { return new Uri(p); }
  static joinPath(b, ...p) { return new Uri(path.join(b.fsPath, ...p)); }
  with(c) { return new Uri(this.fsPath, c.scheme || this.scheme, c.query || this.query); }
  toString() { return this.scheme + "://" + this.fsPath; }
}
class Position { constructor(line, character) { this.line = line; this.character = character; } }
class Range { constructor(a, b, c, d) { if (typeof a === "number") { this.start = new Position(a, b); this.end = new Position(c, d); } else { this.start = a; this.end = b; } } }
class Selection extends Range {}
class MarkdownString { constructor(v = "") { this.value = v; } }
class Hover { constructor(c, r) { this.contents = c; this.range = r; } }
class CodeLens { constructor(r, c) { this.range = r; this.command = c; } }
class Diagnostic { constructor(r, m, s) { this.range = r; this.message = m; this.severity = s; } }
class ThemeColor { constructor(id) { this.id = id; } }
class RelativePattern { constructor(b, p) { this.base = b; this.pattern = p; } }
class CancellationTokenSource { constructor() { this.em = new EventEmitter(); this.token = { isCancellationRequested: false, onCancellationRequested: this.em.event }; } cancel() { this.token.isCancellationRequested = true; this.em.fire(); } dispose() {} }
const config = { useFakeBob: true, testCommand, baseBranch: "main" };
const workspaceFolders = [{ uri: Uri.file(root), name: "smoke", index: 0 }];
const commands = new Map();
let webviewProvider;
const vscode = {
  Disposable, EventEmitter, Uri, Position, Range, Selection, MarkdownString, Hover, CodeLens, Diagnostic, ThemeColor, RelativePattern, CancellationTokenSource,
  OverviewRulerLane: { Left: 1, Center: 2, Right: 4 }, StatusBarAlignment: { Left: 1, Right: 2 },
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 }, ProgressLocation: { Notification: 15 }, TextEditorRevealType: { InCenter: 1 },
  window: {
    visibleTextEditors: [],
    onDidChangeVisibleTextEditors: () => new Disposable(),
    createTextEditorDecorationType: () => new Disposable(),
    createStatusBarItem: () => ({ show() {}, hide() {}, dispose() {}, text: "", tooltip: "" }),
    createOutputChannel: () => ({ appendLine: (l) => process.env.SMOKE_VERBOSE && console.log("   | " + l), show() {}, dispose() {} }),
    registerWebviewViewProvider: (id, p) => { webviewProvider = p; return new Disposable(); },
    showInformationMessage: async (m) => { messages.info.push(m); return undefined; },
    showWarningMessage: async (m, opts) => { messages.warn.push(m); return opts && opts.modal ? modalAnswer : undefined; },
    showErrorMessage: async (m) => { messages.error.push(m); return undefined; },
    withProgress: async (_o, task) => task({ report() {} }, new CancellationTokenSource().token),
    showTextDocument: async () => ({ selection: null, revealRange() {} }),
  },
  workspace: {
    workspaceFolders,
    getConfiguration: () => ({ get: (k, d) => (k in config ? config[k] : d) }),
    onDidChangeConfiguration: () => new Disposable(),
    onDidChangeTextDocument: () => new Disposable(),
    createFileSystemWatcher: () => ({ onDidChange() {}, onDidCreate() {}, onDidDelete() {}, dispose() {} }),
    openTextDocument: async (uri) => ({ lineCount: 1000, lineAt: (n) => ({ range: new Range(n, 0, n, 0) }), uri }),
  },
  languages: {
    registerHoverProvider: () => new Disposable(),
    registerCodeLensProvider: () => new Disposable(),
    createDiagnosticCollection: () => { const m = new Map(); return { clear: () => m.clear(), set: (u, d) => m.set(u.fsPath, d), dispose() {}, get size() { return m.size; }, _m: m }; },
  },
  commands: {
    registerCommand: (id, fn) => { commands.set(id, fn); return new Disposable(() => commands.delete(id)); },
    executeCommand: async (id, ...args) => (commands.has(id) ? commands.get(id)(...args) : undefined),
  },
  env: { clipboard: { writeText: async (t) => { vscode.env.clipboard.last = t; } } },
};
const originalLoad = Module._load;
Module._load = function (request, ...rest) { return request === "vscode" ? vscode : originalLoad.call(this, request, ...rest); };

// ---------- helpers ----------
const memento = () => { const m = new Map(); return { get: (k, d) => (m.has(k) ? m.get(k) : d), update: async (k, v) => { m.set(k, v); }, keys: () => [...m.keys()] }; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(cond, label) { console.log((cond ? "PASS " : "FAIL ") + label); if (!cond) failures++; }
async function waitFor(pred, label, ms = 120000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (pred()) return true; await sleep(100); } check(false, "timed out waiting for " + label); return false; }

(async () => {
  const ext = require(path.join(extRoot, "dist", "extension.js"));
  const subscriptions = [];
  await ext.activate({ subscriptions, workspaceState: memento(), globalState: memento(), extensionUri: Uri.file(extRoot), extensionPath: extRoot });
  check(webviewProvider, "webview provider registered");
  check(commands.has("bobReadiness.toggleHighlights") && commands.has("bobReadiness.sendToBob"), "commands registered");

  // Fake webview
  const states = [];
  let receive;
  const view = {
    webview: { cspSource: "vscode-resource:", options: {}, html: "", onDidReceiveMessage: (cb) => { receive = cb; return new Disposable(); }, postMessage: async (m) => { states.push(m.state); } },
    onDidDispose: () => new Disposable(), onDidChangeVisibility: () => new Disposable(), show() {}, visible: true,
  };
  webviewProvider.resolveWebviewView(view);
  check(view.webview.html.includes("Content-Security-Policy") && /nonce-/.test(view.webview.html), "panel html has CSP nonce");
  const last = () => states[states.length - 1];
  const send = async (m) => { await receive(m); await sleep(50); };

  await send({ type: "ready" });
  check(last().hasContext && last().header.repoName === "tinydb" && last().header.readiness === "73%", "header from context");
  check(last().tabs.review.length === 3 && last().tabs.testing.length === 4 && last().tabs.modernize.length === 3, "findings per tab");
  check(last().tabs.review[2].disabled === true && last().tabs.review[2].gateLabel === "Needs a person", "blocked finding disabled");

  await send({ type: "toggleFinding", id: "F001", selected: true });
  await send({ type: "toggleFinding", id: "F007", selected: true });
  await send({ type: "toggleFinding", id: "F003", selected: true });
  check(last().footer.selected === 2 && last().footer.coinsText === "about 1.5 Bobcoins", "footer totals ignore blocked finding: " + JSON.stringify(last().footer));
  check(messages.info.some((m) => m.includes("needs a person")), "blocked finding explained");

  // CodeLens command queues the function's findings
  await commands.get("bobReadiness.queueFunction")("tinydb/table.py::Table.upsert");
  await sleep(50);
  check(last().footer.selected === 3, "CodeLens command adds F004");
  await commands.get("bobReadiness.queueFinding")("F004");
  await sleep(50);
  check(last().footer.selected === 2, "hover command toggles F004 off");

  // Release tab
  await send({ type: "setTab", tab: "release" });
  await waitFor(() => last().release && last().release.verdict, "release data");
  check(last().release.sinceLabel.startsWith("v"), "release since tag " + last().release.sinceLabel);
  check(typeof last().release.commitCount === "number" && Array.isArray(last().release.notes), "release commits and notes");
  await send({ type: "copyReleaseNotes" });
  check((vscode.env.clipboard.last || "").startsWith("# Release notes"), "copy release notes");

  // Onboarding chat
  await send({ type: "setTab", tab: "onboarding" });
  check(last().onboarding && last().onboarding.setup.includes("pip install -e .") && last().onboarding.starterTasks.length === 3, "onboarding setup and starter tasks");
  await send({ type: "ask", question: "How do queries work?" });
  await waitFor(() => last().onboarding.messages.length === 1 && !last().onboarding.messages[0].pending, "fake Bob answer");
  check(last().onboarding.messages[0].answer.includes("Fake Bob answer"), "answer shown");
  check(last().onboarding.messages[0].costLabel === "Answered by Bob, 0.0 Bobcoins", "cost label: " + last().onboarding.messages[0].costLabel);
  await send({ type: "ask", question: "how do queries WORK" });
  await sleep(100);
  check(last().onboarding.messages.length === 2 && last().onboarding.messages[1].costLabel === "Answered before, free", "repeated question is free");
  check(git(["status", "--porcelain"]) === "", "onboarding left the tree clean");

  // Approve and keep
  await send({ type: "setTab", tab: "review" });
  const baseBranch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  await send({ type: "sendToBob" });
  check(messages.warn.some((m) => m.startsWith("Send 2 changes to Bob?")), "modal shown");
  await waitFor(() => last().run && last().run.canDecide, "Bob run to finish");
  const run = last().run;
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  check(/^bob\/readiness-\d{8}-\d{4}$/.test(branch) && run.branch === branch, "on new branch " + branch);
  check(fs.readFileSync(path.join(root, "tinydb", "table.py"), "utf8").includes("# fake-bob: reviewed"), "table.py edited by fake Bob");
  check(fs.readFileSync(path.join(root, "tinydb", "storages.py"), "utf8").includes("# fake-bob: reviewed"), "storages.py edited by fake Bob");
  check(run.files.length === 2 && run.files.every((f) => f.added === 1 && f.removed === 0), "diff stats: " + JSON.stringify(run.files));
  check(run.tests && run.tests.kind === "pass", "tests passed: " + (run.tests && run.tests.summary));
  check(run.done.length >= 2, "done items listed");
  await send({ type: "keep" });
  await waitFor(() => !last().run, "keep to finish");
  check(git(["log", "-1", "--format=%s"]) === "bob: readiness fixes for F001, F007", "commit on branch: " + git(["log", "-1", "--format=%s"]));
  check(git(["status", "--porcelain"]) === "", "tree clean after keep");
  check(last().footer.selected === 0, "queue cleared after keep");
  git(["checkout", "-q", baseBranch]);

  // Same minute, same branch name: the extension must refuse rather than reuse the branch.
  await send({ type: "toggleFinding", id: "F004", selected: true });
  await send({ type: "sendToBob" });
  await waitFor(() => messages.error.some((m) => m.includes("already exists")) || last().run, "branch collision check", 10000);
  check(messages.error.some((m) => m.includes("already exists")) && !last().run, "existing branch name refused");
  messages.error.length = 0;

  // Approve and discard: pretend a minute passed by removing the kept branch's name.
  git(["branch", "-D", branch]);
  await send({ type: "sendToBob" });
  await waitFor(() => last().run && last().run.canDecide, "second Bob run");
  check(git(["rev-parse", "--abbrev-ref", "HEAD"]).startsWith("bob/readiness-"), "second run on a bob branch");
  await send({ type: "discard" });
  await waitFor(() => !last().run, "discard to finish");
  check(git(["rev-parse", "--abbrev-ref", "HEAD"]) === baseBranch, "back on " + baseBranch + " after discard");
  check(!fs.readFileSync(path.join(root, "tinydb", "table.py"), "utf8").includes("fake-bob"), "discard reverted table.py");
  check(git(["branch", "--list", "bob/readiness-*"]) === "", "bob branch deleted after discard");

  // Dirty tree refusal
  fs.appendFileSync(path.join(root, "README.rst"), "\ndirty\n");
  await send({ type: "toggleFinding", id: "F007", selected: true });
  await send({ type: "sendToBob" });
  await waitFor(() => messages.error.some((m) => m.includes("uncommitted changes")) || last().run, "dirty tree check", 10000);
  check(messages.error.some((m) => m.includes("uncommitted changes")), "dirty tree refused");
  check(!last().run, "no run started on dirty tree");

  // Cancel in the modal does nothing
  git(["checkout", "-q", "--", "README.rst"]);
  modalAnswer = undefined;
  const before = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  await send({ type: "sendToBob" });
  await sleep(500);
  check(git(["rev-parse", "--abbrev-ref", "HEAD"]) === before && !last().run, "modal cancel does nothing");

  for (const s of subscriptions) { try { s.dispose(); } catch { /* ignore */ } }
  fs.rmSync(root, { recursive: true, force: true });
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll smoke checks passed");
  process.exit(failures ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
