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
class FileDecoration { constructor(badge, tooltip, color) { this.badge = badge; this.tooltip = tooltip; this.color = color; this.propagate = false; } }
class RelativePattern { constructor(b, p) { this.base = b; this.pattern = p; } }
class CodeAction { constructor(title, kind) { this.title = title; this.kind = kind; } }
const CodeActionKind = { QuickFix: { value: "quickfix" } };
class CancellationTokenSource { constructor() { this.em = new EventEmitter(); this.token = { isCancellationRequested: false, onCancellationRequested: this.em.event }; } cancel() { this.token.isCancellationRequested = true; this.em.fire(); } dispose() {} }
// bobCommand is a harmless no-op so that even a misconfigured check can never reach the real Bob binary.
const config = { useFakeBob: true, testCommand, baseBranch: "main", bobCommand: "false" };
const opened = [];
const workspaceFolders = [{ uri: Uri.file(root), name: "smoke", index: 0 }];
const commands = new Map();
let webviewProvider;
let decorationProvider;
let codeActionProvider;
const executed = [];
const vscode = {
  Disposable, EventEmitter, Uri, Position, Range, Selection, MarkdownString, Hover, CodeLens, Diagnostic, ThemeColor, FileDecoration, RelativePattern, CancellationTokenSource, CodeAction, CodeActionKind,
  OverviewRulerLane: { Left: 1, Center: 2, Right: 4 }, StatusBarAlignment: { Left: 1, Right: 2 },
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 }, ProgressLocation: { Notification: 15 }, TextEditorRevealType: { InCenter: 1 },
  window: {
    visibleTextEditors: [],
    onDidChangeVisibleTextEditors: () => new Disposable(),
    createTextEditorDecorationType: () => new Disposable(),
    createStatusBarItem: () => ({ show() {}, hide() {}, dispose() {}, text: "", tooltip: "" }),
    createOutputChannel: () => ({ appendLine: (l) => process.env.SMOKE_VERBOSE && console.log("   | " + l), show() {}, dispose() {} }),
    registerWebviewViewProvider: (id, p) => { webviewProvider = p; return new Disposable(); },
    registerFileDecorationProvider: (p) => { decorationProvider = p; return new Disposable(); },
    showInformationMessage: async (m, ...rest) => {
      messages.info.push(m);
      const buttons = rest.filter((r) => typeof r === "string");
      if (m.startsWith("Kept Bob's changes") && buttons.includes("Create pull request")) return "Create pull request";
      return undefined;
    },
    activeTextEditor: undefined,
    onDidChangeActiveTextEditor: () => new Disposable(),
    showWarningMessage: async (m, opts) => { messages.warn.push(m); return opts && opts.modal ? modalAnswer : undefined; },
    showErrorMessage: async (m) => { messages.error.push(m); return undefined; },
    withProgress: async (_o, task) => task({ report() {} }, new CancellationTokenSource().token),
    showTextDocument: async () => ({ selection: null, revealRange() {} }),
  },
  workspace: {
    workspaceFolders,
    getConfiguration: () => ({ get: (k, d) => (k in config ? config[k] : d) }),
    onDidChangeConfiguration: () => new Disposable(),
    findFiles: async () => [],
    onDidChangeTextDocument: () => new Disposable(),
    createFileSystemWatcher: () => ({ onDidChange() {}, onDidCreate() {}, onDidDelete() {}, dispose() {} }),
    openTextDocument: async (uriOrOptions) => {
      if (uriOrOptions && uriOrOptions.content !== undefined) { opened.push("untitled:" + uriOrOptions.language); return { getText: () => uriOrOptions.content, lineCount: 1, lineAt: () => ({ range: new Range(0, 0, 0, 0) }) }; }
      opened.push(uriOrOptions.fsPath); return { lineCount: 1000, lineAt: (n) => ({ range: new Range(n, 0, n, 0) }), uri: uriOrOptions };
    },
  },
  languages: {
    registerHoverProvider: () => new Disposable(),
    registerCodeLensProvider: () => new Disposable(),
    registerCodeActionsProvider: (sel, p) => { codeActionProvider = p; return new Disposable(); },
    createDiagnosticCollection: () => { const m = new Map(); return { clear: () => m.clear(), set: (u, d) => m.set(u.fsPath, d), dispose() {}, get size() { return m.size; }, _m: m }; },
  },
  commands: {
    registerCommand: (id, fn) => { commands.set(id, fn); return new Disposable(() => commands.delete(id)); },
    executeCommand: async (id, ...args) => { executed.push({ id, args }); return commands.has(id) ? commands.get(id)(...args) : undefined; },
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
  check(executed.some((e) => e.id === "vscode.diff"), "diff of the first changed file opened automatically");
  executed.length = 0;
  await send({ type: "openAllDiffs" });
  await sleep(100);
  check(executed.filter((e) => e.id === "vscode.diff").length === 2, "Review all changes opens a diff per file");
  await send({ type: "keep" });
  await waitFor(() => !last().run, "keep to finish");
  const pr = vscode.env.clipboard.last || "";
  check(pr.startsWith("Bob: readiness fixes for F001, F007") && pr.includes("## Items") && pr.includes("| F001 |") && pr.includes("Passed:"), "pull request draft on the clipboard (no GitHub CLI here)");
  check(opened.some((p) => p === "untitled:markdown"), "pull request draft opened as a document");
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

  // Budget guardrail (only applies with real Bob, so pretend fake Bob is off; nothing runs because it refuses first)
  git(["checkout", "-q", "--", "README.rst"]);
  await send({ type: "toggleFinding", id: "F001", selected: true }); // F001 + F007 = 1.5 coins, budget 1
  config.useFakeBob = false; config.sessionBudget = 1;
  messages.warn.length = 0;
  await send({ type: "sendToBob" });
  await waitFor(() => messages.warn.some((m) => m.includes("over budget")) || last().run, "budget check", 5000);
  check(messages.warn.some((m) => m.includes("over budget")) && !last().run && !messages.warn.some((m) => m.startsWith("Send ")), "over budget refused before the modal");
  config.useFakeBob = true; config.sessionBudget = 5;

  // Cancel in the modal does nothing
  modalAnswer = undefined;
  const before = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  await send({ type: "sendToBob" });
  await sleep(500);
  check(git(["rev-parse", "--abbrev-ref", "HEAD"]) === before && !last().run, "modal cancel does nothing");

  for (const s of subscriptions) { try { s.dispose(); } catch { /* ignore */ } }
  fs.rmSync(root, { recursive: true, force: true });

  // ---------- Scenario 2: the Blindspot repository itself as the workspace (report contract) ----------
  console.log("\n-- Exam tab, heatmap and editor features from results/sim plus a fake readiness context");
  const realRoot = path.resolve(extRoot, "..");
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bob-readiness-smoke2-"));
  // A copy of the Blindspot layout: results/sim, target.lock.json, target/tinydb, cli.py and the engine package for Publish.
  execFileSync("rsync", ["-a", path.join(realRoot, "results", "sim") + "/", path.join(repoRoot, "results", "sim") + "/"]);
  fs.copyFileSync(path.join(realRoot, "target.lock.json"), path.join(repoRoot, "target.lock.json"));
  execFileSync("rsync", ["-a", "--exclude", ".venv", path.join(realRoot, "target", "tinydb") + "/", path.join(repoRoot, "target", "tinydb") + "/"]);
  fs.copyFileSync(path.join(realRoot, "cli.py"), path.join(repoRoot, "cli.py"));
  execFileSync("rsync", ["-a", "--exclude", "__pycache__", path.join(realRoot, "blindspot") + "/", path.join(repoRoot, "blindspot") + "/"]);
  // Fake readiness context at the workspace root, paths relative to the target repo, lines aligned to it.
  fs.mkdirSync(path.join(repoRoot, ".bob", "context"), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, ".bob", "rules"), { recursive: true });
  const fakeContext = path.join(repoRoot, ".bob", "context", "readiness.json");
  fs.copyFileSync(path.join(extRoot, "fixtures", "readiness.sample.json"), fakeContext);
  fs.copyFileSync(path.join(extRoot, "fixtures", "readiness-context.sample.md"), path.join(repoRoot, ".bob", "rules", "readiness-context.md"));
  execFileSync("python3", [path.join(extRoot, "scripts", "fix-fixture-lines.py"), path.join(repoRoot, "target", "tinydb"), fakeContext]);
  const ctxJson = JSON.parse(fs.readFileSync(fakeContext, "utf8"));
  ctxJson.files.push({ path: "tinydb/version.py", readiness: 0.95, status: "ready", imports: [] });
  fs.writeFileSync(fakeContext, JSON.stringify(ctxJson, null, 2));
  const venvPython = path.join(realRoot, ".venv", "bin", "python");
  if (fs.existsSync(venvPython)) config.publishCommand = `"${venvPython}" cli.py publish`;
  workspaceFolders[0] = { uri: Uri.file(repoRoot), name: "blindspot", index: 0 };
  states.length = 0;
  const subs2 = [];
  await ext.activate({ subscriptions: subs2, workspaceState: memento(), globalState: memento(), extensionUri: Uri.file(extRoot), extensionPath: extRoot });
  webviewProvider.resolveWebviewView(view);
  await send({ type: "ready" });
  await waitFor(() => last() && last().exam, "exam state", 10000);
  const x = last().exam;
  check(x && x.simulated && x.usingSim, "simulated banner flags set");
  check(x && x.run.name === "train_C2_r1" && x.overall.accuracy === "89%", "run and overall accuracy: " + (x && x.run.name + " " + x.overall.accuracy));
  check(x && x.modules.map((m) => m.module).slice(0, 2).join(",") === "tinydb,tinydb.utils", "modules worst first");
  check(x && x.runs.length === 3, "three run reports found: " + (x && x.runs.join(",")));
  check(x && x.history.axis.length === 3 && x.history.accuracy.length === 3, "history chart has three conditions");
  check(last().hasContext && last().header.repoName === "tinydb" && last().header.readiness === "73%", "readiness context found at the workspace root and mapped onto target/tinydb");
  check(last().tabs.review.length === 3, "findings tabs filled from the fake context");
  await send({ type: "compareRuns", a: "train_C1_r1", b: "train_C2_r1" });
  await waitFor(() => last().exam && last().exam.compare, "comparison", 10000);
  check(last().exam.compare.rows.length === 8 && last().exam.compare.rows.some((r) => r.delta.startsWith("+")), "comparison rows with deltas");
  const targetRoot = path.join(repoRoot, "target", "tinydb");
  const deco = (rel) => decorationProvider.provideFileDecoration(Uri.file(path.join(targetRoot, rel)));
  const utils = deco("tinydb/utils.py");
  check(utils && utils.badge === "!" && utils.color.id === "blindspot.red", "red module gets a red badge");
  const init = deco("tinydb/__init__.py");
  check(init && init.badge === "!?" && init.tooltip.includes("Few answers"), "red plus few answers marker");
  const queries = deco("tinydb/queries.py");
  check(queries && queries.badge === undefined && queries.color.id === "blindspot.heat0", "cool module coloured by heat, no badge");
  const ops = deco("tinydb/operations.py");
  check(ops && ops.badge === "?" && ops.color.id === "blindspot.heat1", "few answers marker on a non red module");
  check(deco("tinydb") && deco("tinydb").color.id === "blindspot.heat0", "directory coloured from directories[]");
  check(deco("README.rst") === undefined && deco("tinydb/mypy_plugin.py") === undefined, "unexamined files stay neutral");
  check(decorationProvider.provideFileDecoration(Uri.file(path.join(repoRoot, "cli.py"))) === undefined, "files outside the target root stay neutral");
  await send({ type: "openTargetFile", file: "tinydb/table.py" });
  await sleep(100);
  check(opened.some((p) => p.endsWith(path.join("target", "tinydb", "tinydb", "table.py"))), "worst entity click opens the target file");

  // Heatmap: both grids
  await send({ type: "setTab", tab: "heatmap" });
  const hm = last().heatmap;
  check(hm && hm.runs.columns.length === 3 && hm.runs.rows.length === 8, "heatmap files over runs: 8 files x 3 runs");
  check(hm && hm.functions.total === 20 && hm.functions.wrong === 6 && hm.functions.rows.length === 7, "heatmap functions by file from the fake context");
  const tableRow = hm && hm.functions.rows.find((r) => r.path === "tinydb/table.py");
  const updateLine = fs.readFileSync(path.join(targetRoot, "tinydb", "table.py"), "utf8").split("\n").findIndex((l) => l.startsWith("    def update(")) + 1;
  check(tableRow && tableRow.cells.some((c) => c.name === "Table.update" && c.red && c.line === updateLine), "heatmap square for Table.update is red at its real line " + updateLine);

  // Tree colours fall back to the readiness context for files the exam did not cover
  const version = deco("tinydb/version.py");
  check(version && version.color.id === "blindspot.heat0" && version.tooltip.includes("readiness 95%"), "context file colour when the exam has no entry");

  // Active file warning
  const tableUri = Uri.file(path.join(targetRoot, "tinydb", "table.py"));
  const warnItem = subs2.find((d) => d && d.summarize);
  const summary = warnItem ? warnItem.summarize(tableUri) : undefined;
  check(summary && /confidently wrong here \d+ times?/.test(summary.text), "status bar warning for a risky file: " + (summary && summary.text));
  const safeUri = Uri.file(path.join(targetRoot, "tinydb", "queries.py"));
  const safe = warnItem ? warnItem.summarize(safeUri) : "skipped";
  check(safe === undefined || (safe && safe.text), "warning summary computed for a second file");

  // Copy context for this file
  const copied = await commands.get("bobReadiness.copyFileContext")(tableUri);
  check(copied && copied.includes("Things you were sure about but got wrong:") && copied.includes("Exam result for this module (tinydb.table)") && copied.includes("Study notes"), "copy context merges exam, misconceptions and notes");
  check(vscode.env.clipboard.last === copied, "copy context lands on the clipboard");

  // Code actions from a Problems entry
  const diag = { source: "Bob Readiness", code: "F001 review risk", message: "x" };
  const actions = codeActionProvider.provideCodeActions({ uri: tableUri }, null, { diagnostics: [diag, { source: "Bob Readiness", code: "F003 review risk" }] });
  const titles = actions.map((a) => a.title);
  check(titles.includes("Add F001 to Bob queue") && titles.includes("F003 needs a person: show why") && titles.includes("Copy Bob context for this file") && titles.includes("Open Bob study notes"), "quick fixes: " + titles.join(" | "));

  // Queue every allowed finding in a file
  const queued = await commands.get("bobReadiness.queueFile")(tableUri);
  await sleep(50);
  check(queued === 2 && last().footer.selected === 2, "queue by file adds F001 and F004");

  // Update toast when the context is regenerated
  ctxJson.functions.find((f) => f.name === "Table.search").readiness = 0.95;
  fs.writeFileSync(fakeContext, JSON.stringify(ctxJson, null, 2));
  messages.info.length = 0;
  await commands.get("bobReadiness.reload")();
  await sleep(100);
  check(messages.info.some((m) => m.startsWith("Readiness context updated: 1 function improved")), "toast describes what changed in the context");

  // Onboarding role presets
  await send({ type: "setTab", tab: "onboarding" });
  await send({ type: "setRole", role: "releasing" });
  check(last().onboarding && last().onboarding.role === "releasing" && last().onboarding.suggested[1] === "Which functions have no tests?", "onboarding presets switch by role");
  await send({ type: "publish" });
  await waitFor(() => last().exam && last().exam.publish && !last().exam.publish.running, "publish command", 60000);
  const pub = last().exam.publish;
  check(pub && pub.command.includes("cli.py publish"), "publish runs the CLI: " + (pub && pub.command));
  check(pub && (pub.ok || /invalid choice|not implemented/i.test(pub.output)), "publish result shown (ok or CLI says not implemented yet)");
  for (const s of subs2) { try { s.dispose(); } catch { /* ignore */ } }
  fs.rmSync(repoRoot, { recursive: true, force: true });
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll smoke checks passed");
  process.exit(failures ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
