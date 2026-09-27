/* The web demo's stand-in for the extension host. Everything the real panel asks the extension
   to do (open a file, queue a finding, send to Bob, ask a question, compare runs, publish) is
   answered here with the embedded real data and a scripted fake Bob. No network, no IBM Bob. */
(function () {
  const D = window.DEMO;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = (v) => Math.round(v * 100) + "%";

  let run = D.defaultRun;
  let cond = D.conditions[run];
  let activeTab = "review";
  const selected = new Set();
  let sessionCoins = 0;
  let bobRun = null;
  let runTimers = [];
  const onboarding = { messages: [], role: "new", busy: false, cache: {} };
  let releaseTests = null;
  let compare = null;
  let publishState = null;
  let branch = "main";
  let highlightsOn = true;
  let currentFile = null;
  const openTabs = [];
  const inserted = {}; // file -> Map(line -> text), fake Bob's edits shown as inserted lines

  // ---------- panel (the plugin's own webview) ----------
  const frame = $("panel");
  frame.srcdoc = window.PANEL_HTML;
  window.addEventListener("message", (e) => {
    const m = e.data;
    if (m && m.source === "bob-readiness-panel") handle(m.message);
  });
  function postState() {
    if (frame.contentWindow) frame.contentWindow.postMessage({ type: "state", state: buildState() }, "*");
  }

  function chosenFindings() {
    return cond.ctx.findings.filter((f) => selected.has(f.id) && f.bob_allowed !== "no");
  }
  function coinsOf(findings) {
    return Math.round(findings.reduce((s, f) => s + f.estimated_coins, 0) * 100) / 100;
  }
  function buildState() {
    const base = JSON.parse(JSON.stringify(cond.panel));
    for (const tab of ["review", "testing", "modernize"]) for (const r of base.tabs[tab]) r.selected = !r.disabled && selected.has(r.id);
    const chosen = chosenFindings();
    base.footer = { selected: chosen.length, coinsText: "about " + coinsOf(chosen).toFixed(1) + " Bobcoins", canSend: chosen.length > 0 };
    base.header.sessionCoins = sessionCoins.toFixed(1);
    base.activeTab = activeTab;
    base.exam = Object.assign({}, cond.exam, { compare: compare || undefined, publish: publishState || undefined });
    base.heatmap = cond.heatmap;
    base.onboarding = Object.assign({}, cond.onboarding, { messages: onboarding.messages, role: onboarding.role, suggested: D.suggestedByRole[onboarding.role], busy: onboarding.busy });
    base.release = Object.assign({}, cond.release, releaseTests ? { tests: releaseTests } : {});
    base.run = bobRun || undefined;
    return base;
  }

  function handle(msg) {
    if (!msg || typeof msg !== "object") return;
    switch (msg.type) {
      case "ready": postState(); return;
      case "setTab": activeTab = msg.tab; postState(); return;
      case "toggleFinding": toggleFinding(msg.id, msg.selected); return;
      case "openFile": openFile(msg.file, Number(msg.line) || 1); return;
      case "openTargetFile": openFile(msg.file, 1); return;
      case "openDiff": openDiff(msg.file); return;
      case "openAllDiffs": if (bobRun) for (const f of bobRun.files) openDiff(f.path); return;
      case "sendToBob": sendToBob(); return;
      case "keep": keep(); return;
      case "discard": discard(); return;
      case "cancelRun": cancelRun(); return;
      case "dismissRun": if (bobRun && !bobRun.canDecide) { bobRun = null; postState(); } return;
      case "ask": ask(msg.question); return;
      case "setRole": onboarding.role = msg.role; postState(); return;
      case "compareRuns": compareRuns(msg.a, msg.b); return;
      case "publish": publish(); return;
      case "reloadReport": toast("Exam report reloaded from .bob/blindspot/report_latest.json.", "ok"); postState(); return;
      case "runTests": runReleaseTests(); return;
      case "copyReleaseNotes": copy(releaseNotesMarkdown(), "Release notes copied to the clipboard."); return;
      default: return;
    }
  }

  // ---------- queue ----------
  function toggleFinding(id, on) {
    const f = cond.ctx.findings.find((x) => x.id === id);
    if (!f) return;
    if (f.bob_allowed === "no") {
      toast(id + " needs a person. Bob's readiness on " + f.function_id.split("::").pop() + " is too low, so this finding can never be sent to Bob.", "err");
      postState();
      return;
    }
    if (on) selected.add(id); else selected.delete(id);
    postState();
  }

  // ---------- fake Bob: approve, branch, edit, test, keep or discard ----------
  function branchName(d) {
    const p = (n) => String(n).padStart(2, "0");
    return "bob/readiness-" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes());
  }
  function summaryLine(f) {
    return f.id + ": " + f.title + " (" + f.file + ")";
  }
  function sendToBob() {
    if (bobRun) { toast("Bob is already working, or waiting for your Keep or Discard decision."); return; }
    const findings = chosenFindings();
    if (!findings.length) { toast("Nothing selected. Tick findings first."); return; }
    const br = branchName(new Date());
    const files = new Set(findings.map((f) => f.file));
    const coins = coinsOf(findings);
    const detail = [
      "Bob will change " + findings.length + " place" + (findings.length === 1 ? "" : "s") + " in " + files.size + " file" + (files.size === 1 ? "" : "s") + ":",
      ...findings.map((f) => "- " + summaryLine(f)),
      "",
      "Work happens on a new branch " + br + ". Your current branch is not touched.",
      "",
      "Estimated cost: about " + coins.toFixed(1) + " Bobcoins. Session so far " + sessionCoins.toFixed(1) + " of a 2.0 Bobcoin budget.",
      "Fake Bob is on: no real Bobcoins are spent.",
    ].join("\n");
    modal("Send " + findings.length + " change" + (findings.length === 1 ? "" : "s") + " to Bob?", detail, [
      { label: "Approve and run", primary: true, fn: () => startRun(findings, br) },
      { label: "Cancel" },
    ]);
  }
  function startRun(findings, br) {
    branch = br;
    bobRun = { title: "Bob is working", branch: br, costLabel: "0.0 Bobcoins", stage: "Creating branch", files: [], done: [], canDecide: false, _findings: findings };
    renderStatus();
    postState();
    const later = (ms, fn) => runTimers.push(setTimeout(fn, ms));
    later(700, () => { bobRun.stage = "Bob is working"; postState(); });
    later(2600, () => {
      const counts = {};
      for (const f of findings) {
        const fn = cond.ctx.functions.find((x) => x.id === f.function_id);
        if (!fn) continue;
        inserted[f.file] = inserted[f.file] || new Map();
        inserted[f.file].set(fn.line_start, "# fake-bob: reviewed " + f.id + " against .bob/rules/readiness-context.md (" + fn.name + ")");
        counts[f.file] = (counts[f.file] || 0) + 1;
      }
      bobRun.files = Object.keys(counts).map((p) => ({ path: p, added: counts[p], removed: 0 }));
      bobRun.stage = "Running tests";
      bobRun.tests = { kind: "running", title: "Running tests", summary: ".venv/bin/python -m pytest -q" };
      if (currentFile && counts[currentFile]) renderCode(currentFile);
      postState();
    });
    later(4000, () => {
      bobRun.tests = { kind: "pass", title: "Tests passed", summary: "219 passed in 0.52s" };
      bobRun.stage = undefined;
      bobRun.title = "Bob finished";
      bobRun.canDecide = true;
      bobRun.done = findings.map((f) => summaryLine(f) + (f.bob_allowed === "with_notes" ? ", flagged for review" : ""));
      bobRun.done.push("Bob said: Reviewed each listed function against the readiness notes and left a review marker. (scripted fake Bob)");
      runTimers = [];
      postState();
      if (bobRun.files.length) openDiff(bobRun.files[0].path);
    });
  }
  function cancelRun() {
    if (!bobRun || bobRun.canDecide) return;
    for (const t of runTimers) clearTimeout(t);
    runTimers = [];
    revertInserted(bobRun._findings);
    branch = "main";
    bobRun = Object.assign({}, bobRun, { stage: undefined, error: "Cancelled.", canDecide: false, title: "Bob stopped" });
    toast("Bob did not finish: cancelled. Back on main, nothing kept.", "err");
    renderStatus();
    postState();
    if (currentFile) renderCode(currentFile);
  }
  function revertInserted(findings) {
    for (const f of findings || []) if (inserted[f.file]) delete inserted[f.file];
  }
  function keep() {
    if (!bobRun || !bobRun.canDecide) return;
    const r = bobRun;
    const title = "Bob: readiness fixes for " + r._findings.map((f) => f.id).join(", ");
    toast("Kept Bob's changes on " + r.branch + ". Commit: bob: readiness fixes for " + r._findings.map((f) => f.id).join(", "), "ok", [
      { label: "Create pull request", fn: () => modal(title, pullRequestBody(r), [{ label: "Copy to clipboard", primary: true, fn: () => copy(title + "\n\n" + pullRequestBody(r), "Pull request text copied.") }, { label: "Close" }]) },
    ]);
    finishRun();
  }
  function discard() {
    if (!bobRun || !bobRun.canDecide) return;
    revertInserted(bobRun._findings);
    branch = "main";
    toast("Discarded Bob's changes. You are back on main and the branch is deleted.", "ok");
    finishRun();
    if (currentFile) renderCode(currentFile);
  }
  function finishRun() {
    bobRun = null;
    selected.clear();
    renderStatus();
    postState();
  }
  function pullRequestBody(r) {
    return [
      "Branch " + r.branch + " into main. Made by the Bob Readiness plugin after a person approved the items below.",
      "",
      "## Items",
      "| Id | Finding | File | Gate |",
      "|---|---|---|---|",
      ...r._findings.map((f) => "| " + f.id + " | " + f.title + " | " + f.file + " | " + f.bob_allowed + " |"),
      "",
      "## Files",
      ...r.files.map((f) => "- " + f.path + " (+" + f.added + " -" + f.removed + ")"),
      "",
      "## Tests",
      "Passed: " + (r.tests ? r.tests.summary : ""),
      "",
      "Fake Bob: no real Bobcoins were spent. Cost 0.0.",
    ].join("\n");
  }

  // ---------- onboarding chat ----------
  function normalize(q) { return q.toLowerCase().replace(/\s+/g, " ").replace(/[?.!\s]+$/, "").trim(); }
  function ask(q) {
    if (typeof q !== "string" || !q.trim()) return;
    const key = normalize(q);
    if (onboarding.cache[key]) {
      onboarding.messages.push({ question: q, answer: onboarding.cache[key], costLabel: "Answered before, free", pending: false });
      postState();
      return;
    }
    const msg = { question: q, answer: "", costLabel: "", pending: true };
    onboarding.messages.push(msg);
    onboarding.busy = true;
    postState();
    setTimeout(() => {
      msg.answer = cannedAnswer(key);
      msg.costLabel = "Answered by fake Bob, 0.0 Bobcoins";
      msg.pending = false;
      onboarding.cache[key] = msg.answer;
      onboarding.busy = false;
      postState();
    }, 1300);
  }
  function cannedAnswer(q) {
    const ctx = cond.ctx;
    const tail = " (Scripted answer from the demo's fake Bob; the real plugin asks IBM Bob with the study notes as context.)";
    const wrong = ctx.functions.filter((f) => f.status === "wrong").map((f) => f.name);
    const untested = ctx.functions.filter((f) => !f.tested).map((f) => f.name);
    if (/disk|written|write|storage/.test(q)) return "Data reaches disk through the storage layer in tinydb/storages.py. JSONStorage.write serialises the whole database with json.dump and truncates the file; CachingMiddleware in tinydb/middlewares.py holds writes back and flushes when its cache is full, on flush(), or on close(). Note from the readiness file: JSONStorage.close does not itself call write, and JSONStorage.write raises IOError when the file is not writable." + tail;
    if (/quer/.test(q)) return "Queries live in tinydb/queries.py. Query builds a test function by recording attribute access (Query().name == 'x'), and QueryInstance wraps that function with a hashable representation so results can be cached. Operators like ==, <, matches, search, any, all and map return new QueryInstance objects; Query.map exists even though Bob was unsure about it in the exam." + tail;
    if (/read first|start|where.*begin/.test(q)) return "Read tinydb/database.py (TinyDB, which owns tables and the storage), then tinydb/table.py (Table.insert, search, update, upsert), then tinydb/queries.py. Bob's readiness is lowest in tinydb/operations.py and tinydb/__init__.py, so take its answers about those with care." + tail;
    if (/least|understand|wrong before|weak/.test(q)) return "From the exam, the places Bob understands least are: " + (wrong.length ? wrong.join(", ") : "none marked sure but wrong") + ". By file, " + ctx.files.slice().sort((a, b) => a.readiness - b.readiness).slice(0, 2).map((f) => f.path + " at " + pct(f.readiness)).join(" and ") + " score lowest." + tail;
    if (/update/.test(q)) return "Table.update takes fields (a dict or a callable) and optionally cond and doc_ids. With no cond and no doc_ids it updates every document. Table.upsert wraps it and raises ValueError when it cannot decide which documents to touch, which Bob did not know in the C1 exam." + tail;
    if (/test.*storage|storage.*test|cover/.test(q)) return "tests/test_storages.py covers JSONStorage, MemoryStorage and the middleware chain, including read on an empty file, write permissions and encoding. Names from the readiness file that appear under tests/: every studied function except " + (untested.length ? untested.join(", ") : "none") + "." + tail;
    if (/no tests|without tests|untested/.test(q)) return (untested.length ? "Functions in the readiness file whose name appears in no test: " + untested.join(", ") + "." : "Every function in the readiness file is mentioned by at least one test.") + " The Testing tab lists the ones where Bob is also unsure." + tail;
    if (/release notes|mention/.test(q)) return "Since v4.9.0 there is one commit, the demo settings. Nothing in the studied code changed, so the release notes need no Fixed or Added entries. The Release tab has the draft." + tail;
    if (/changed recently|recent/.test(q)) return "No studied function changed since the last tag v4.9.0. The Release tab maps every commit's changed lines onto the functions in the readiness file, so this fills in as soon as something changes." + tail;
    return "This repository is tinydb, a small document database in pure Python. The readiness file says Bob answered " + pct(ctx.summary.readiness) + " of " + ctx.summary.questions + " exam questions correctly and was confidently wrong " + ctx.summary.sure_but_wrong + " times. The corrections are in .bob/rules/readiness-context.md, which Bob loads automatically." + tail;
  }

  // ---------- exam tab: compare, publish; release tab ----------
  function compareRuns(a, b) {
    if (a === b) { toast("Pick two different runs to compare."); return; }
    const rows = D.compares[a + "|" + b];
    if (!rows) { toast("Could not read one of the run reports.", "err"); return; }
    compare = { a, b, rows };
    postState();
  }
  function publish() {
    if (publishState && publishState.running) return;
    const command = '"/Users/aziz/blindspot/.venv/bin/python" cli.py publish --dest "/Users/aziz/blindspot/presentation-tinydb"';
    publishState = { running: true, output: "", command };
    postState();
    setTimeout(() => {
      const newest = "test_C2_r1";
      publishState = {
        running: false, ok: true, command,
        output: ["Published context from " + newest + " into presentation-tinydb:", "  .bob/context/readiness.json", "  .bob/rules/readiness-context.md", "  AGENTS.md", "  .bob/blindspot/report_latest.json", "  .bob/blindspot/history.jsonl", "These files are listed in .git/info/exclude there, so the working tree stays clean for the plugin.", "Exams are not affected: they run in fresh copies with agent files removed.", "(simulated by the web demo)"].join("\n"),
      };
      if (run !== newest) switchRun(newest, true); else postState();
    }, 1400);
  }
  function runReleaseTests() {
    releaseTests = { kind: "running", title: "Running tests", summary: ".venv/bin/python -m pytest -q" };
    postState();
    setTimeout(() => { releaseTests = { kind: "pass", title: "Tests passed", summary: "219 passed in 0.52s" }; postState(); }, 1200);
  }
  function releaseNotesMarkdown() {
    const r = cond.release;
    return ["# Release notes since " + r.sinceLabel, "", ...r.notes.map((n) => "- " + n), "", "Readiness of changed files: no studied file changed."].join("\n");
  }

  // ---------- switching between the two published runs ----------
  function switchRun(to, keepPublish) {
    if (to === run) return;
    const texts = D.changes[run + ">" + to] || [];
    run = to;
    cond = D.conditions[run];
    for (const id of [...selected]) if (!cond.ctx.findings.some((f) => f.id === id)) selected.delete(id);
    compare = null;
    if (!keepPublish) publishState = null;
    renderSwitch();
    renderTree();
    renderStatus();
    if (currentFile) renderCode(currentFile);
    postState();
    for (const t of texts) toast(t, "ok", [{ label: "Open Heatmap", fn: () => { activeTab = "heatmap"; postState(); } }]);
  }
  function renderSwitch() {
    $("switch").innerHTML = D.runs.map((r) => {
      const c = D.conditions[r];
      return '<button data-run="' + r + '"' + (r === run ? ' class="active"' : "") + ' title="Show the plugin as it looks after publishing ' + r + '">' + esc(c.label) + ": " + esc(c.accuracy) + "</button>";
    }).join("");
  }
  $("switch").addEventListener("click", (e) => { const b = e.target.closest("[data-run]"); if (b) switchRun(b.dataset.run); });

  // ---------- Explorer ----------
  function renderTree() {
    const paths = Object.keys(D.files).sort();
    const top = paths.filter((p) => !p.includes("/"));
    const pkg = paths.filter((p) => p.startsWith("tinydb/"));
    const node = (p, depth, isDir) => {
      const t = cond.tree[p];
      const color = t ? t.color : "#c8c8c8";
      const label = isDir ? p : p.split("/").pop();
      return '<div class="node depth' + depth + (isDir ? " dir" : "") + (p === currentFile ? " active" : "") + '" data-path="' + esc(p) + '" data-dir="' + (isDir ? 1 : 0) + '" title="' + esc(t ? t.tooltip : "Not examined") + '" style="color:' + color + '">' +
        '<span class="name">' + esc(label) + "</span>" + (t && t.badge ? '<span class="badge-t">' + esc(t.badge) + "</span>" : "") + "</div>";
    };
    $("tree").innerHTML = node("tinydb", 0, true) + pkg.map((p) => node(p, 1, false)).join("") + top.map((p) => node(p, 0, false)).join("");
  }
  $("tree").addEventListener("click", (e) => {
    const n = e.target.closest("[data-path]");
    if (n && n.dataset.dir !== "1") openFile(n.dataset.path, 1);
  });

  // ---------- editor ----------
  function openFile(file, line) {
    if (!D.files[file]) { toast(file + " is not in this demo (only the examined package is embedded).", "err"); return; }
    currentFile = file;
    if (!openTabs.includes(file)) openTabs.push(file);
    renderTabs();
    renderTree();
    renderCode(file);
    renderStatus();
    scrollTo(line || 1);
  }
  function openDiff(file) {
    const ins = inserted[file];
    openFile(file, ins ? Math.min(...ins.keys()) : 1);
  }
  function renderTabs() {
    $("editor-tabs").innerHTML = openTabs.map((f) => {
      const t = cond.tree[f];
      return '<div class="tab' + (f === currentFile ? " active" : "") + '" data-file="' + esc(f) + '" style="' + (t ? "color:" + t.color : "") + '">' + esc(f.split("/").pop()) + (t && t.badge ? " " + esc(t.badge) : "") + "</div>";
    }).join("");
  }
  $("editor-tabs").addEventListener("click", (e) => { const t = e.target.closest("[data-file]"); if (t) openFile(t.dataset.file, 1); });

  function fnAt(file, line) {
    const fns = cond.ctx.functions.filter((f) => f.file === file && f.line_start <= line && line <= f.line_end);
    return fns.sort((a, b) => (b.line_start - a.line_start))[0]; // innermost
  }
  function renderCode(file) {
    const src = D.files[file].split("\n");
    const findings = cond.ctx.findings.filter((f) => f.file === file);
    const ins = inserted[file];
    let html = "";
    for (let i = 1; i <= src.length; i++) {
      if (ins && ins.has(i)) html += '<div class="line inserted" data-line="' + i + '"><span class="gutter"></span><span class="num">+</span><span class="src">' + esc(indentOf(src[i - 1]) + ins.get(i)) + "</span></div>";
      const fn = highlightsOn ? fnAt(file, i) : undefined;
      const cls = fn && fn.status === "wrong" ? " wrong" : fn && fn.status === "part" ? " part" : "";
      const dot = highlightsOn && findings.some((f) => f.line_start <= i && i <= f.line_end) ? "●" : "";
      const hint = fn && fn.line_start === i && cond.hints[fn.id] ? '<span class="hint">' + esc(cond.hints[fn.id]) + "</span>" : "";
      html += '<div class="line' + cls + '" data-line="' + i + '"><span class="gutter" title="' + (dot ? "Finding on this line" : "") + '">' + dot + '</span><span class="num">' + i + '</span><span class="src">' + esc(src[i - 1]) + "</span>" + hint + "</div>";
    }
    $("code").innerHTML = html;
  }
  function indentOf(s) { return (s.match(/^\s*/) || [""])[0]; }
  function scrollTo(line) {
    const el = $("code").querySelector('.line[data-line="' + line + '"]:not(.inserted)');
    if (!el) return;
    const wrap = $("code-wrap");
    wrap.scrollTop = Math.max(0, el.offsetTop - wrap.clientHeight / 3);
    el.classList.add("flash");
  }
  const card = $("hovercard");
  $("code").addEventListener("mousemove", (e) => {
    const lineEl = e.target.closest(".line");
    if (!lineEl || !currentFile || !highlightsOn) { card.style.display = "none"; return; }
    const line = Number(lineEl.dataset.line);
    const fn = fnAt(currentFile, line);
    const fnd = cond.ctx.findings.filter((f) => f.file === currentFile && f.line_start <= line && line <= f.line_end);
    if (!fn && !fnd.length) { card.style.display = "none"; return; }
    card.innerHTML = hoverHtml(fn, fnd);
    card.style.display = "block";
    const rect = $("code-wrap").getBoundingClientRect();
    card.style.left = Math.min(e.clientX - rect.left + 16, rect.width - 460) + "px";
    card.style.top = Math.min(e.clientY - rect.top + 18, rect.height - card.offsetHeight - 10) + "px";
  });
  $("code").addEventListener("mouseleave", () => { card.style.display = "none"; });
  function hoverHtml(fn, fnd) {
    const statusLabel = { ok: "Bob knows this", part: "Partly known", wrong: "Sure but wrong" };
    const gate = { yes: "Bob can do this", with_notes: "Bob with notes, review needed", no: "Needs a person" };
    let h = "";
    if (fn) {
      h += "<p><b>" + esc(fn.name) + "</b> <span class='muted'>readiness " + pct(fn.readiness) + ", " + statusLabel[fn.status] + (fn.tested ? ", tested" : ", no test mentions it") + "</span></p>";
      for (const m of fn.misconceptions.slice(0, 2)) h += "<p><span class='wrongtxt'>Bob believed (" + pct(m.confidence) + "):</span> " + esc(m.believed) + "<br><span class='truthtxt'>Actually:</span> " + esc(m.truth) + "</p>";
    }
    for (const f of fnd) h += "<p><b>" + esc(f.id) + "</b> " + esc(f.title) + "<br><span class='muted'>" + esc(f.recommendation) + "</span><br><i>" + gate[f.bob_allowed] + "</i>" + (f.bob_allowed !== "no" ? " · tick it in the Review tab" : "") + "</p>";
    return h;
  }

  // ---------- status bar ----------
  function renderStatus() {
    const ctx = cond.ctx;
    const wrongHere = currentFile ? ctx.functions.filter((f) => f.file === currentFile && f.status === "wrong").reduce((n, f) => n + f.misconceptions.filter((m) => m.confidence >= 0.8).length, 0) : 0;
    $("statusbar").innerHTML =
      '<div class="item click" id="toggle-hl" title="Cmd+Alt+R in the IDE: hide and show every highlight">Readiness: ' + (highlightsOn ? "On" : "Off") + "</div>" +
      '<div class="item" title="Overall readiness from the context file, and Bobcoins spent by the plugin this session">' + pct(ctx.summary.readiness) + " readiness · " + sessionCoins.toFixed(1) + " Bobcoins</div>" +
      '<div class="item" title="Exam accuracy and condition from the report">Blindspot ' + esc(cond.exam.overall.accuracy) + " " + esc(cond.condition) + "</div>" +
      (wrongHere ? '<div class="item warn click" id="explain" title="Click to see why">Bob: confidently wrong here ' + wrongHere + " time" + (wrongHere === 1 ? "" : "s") + "</div>" : "") +
      '<div class="item right" title="Nothing on this page calls IBM Bob">fake Bob</div>' +
      '<div class="item branch" title="Git branch of the demo repository">⎇ ' + esc(branch) + "</div>";
  }
  $("statusbar").addEventListener("click", (e) => {
    if (e.target.closest("#toggle-hl")) { highlightsOn = !highlightsOn; renderStatus(); if (currentFile) renderCode(currentFile); }
    if (e.target.closest("#explain") && currentFile) {
      const fns = cond.ctx.functions.filter((f) => f.file === currentFile && f.status === "wrong");
      modal("Why Bob is risky in " + currentFile, fns.map((f) => f.name + ": " + f.misconceptions[0].believed + "\n  Actually: " + f.misconceptions[0].truth).join("\n\n"), [
        { label: "Copy Bob context for this file", primary: true, fn: () => copy(fileContext(currentFile), "Context for " + currentFile + " copied. Paste it into Bob's chat as a preamble.") },
        { label: "Close" },
      ]);
    }
  });
  function fileContext(file) {
    const ctx = cond.ctx;
    const fns = ctx.functions.filter((f) => f.file === file);
    const mod = cond.exam.modules.find((m) => m.path === file);
    return ["Context for " + file + " from Blindspot (exam run " + cond.exam.run.name + ").", mod ? "Exam result for this module (" + mod.module + "): accuracy " + mod.accuracy + ", confidently wrong " + mod.cw + "." : "", "Things you were sure about but got wrong:", ...fns.flatMap((f) => f.misconceptions.map((m) => "- " + f.name + ": you said " + m.believed + " " + m.truth)), "", "Study notes:", cond.notes].join("\n");
  }

  // ---------- toasts, modal, clipboard ----------
  function toast(text, kind, buttons) {
    const el = document.createElement("div");
    el.className = "toast" + (kind ? " " + kind : "");
    el.innerHTML = esc(text) + (buttons && buttons.length ? '<div class="t-btns">' + buttons.map((b, i) => '<button data-i="' + i + '">' + esc(b.label) + "</button>").join("") + "</div>" : "");
    el.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { const fn = buttons[Number(b.dataset.i)].fn; if (fn) fn(); el.remove(); } });
    $("toasts").appendChild(el);
    setTimeout(() => el.remove(), buttons && buttons.length ? 14000 : 7000);
  }
  function modal(title, detail, buttons) {
    $("modal-title").textContent = title;
    $("modal-detail").textContent = detail;
    $("modal-btns").innerHTML = buttons.map((b, i) => '<button class="' + (b.primary ? "primary" : "secondary") + '" data-i="' + i + '">' + esc(b.label) + "</button>").join("");
    $("modal-btns").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; $("modal-back").hidden = true; const fn = buttons[Number(b.dataset.i)].fn; if (fn) fn(); };
    $("modal-back").hidden = false;
  }
  $("modal-back").addEventListener("click", (e) => { if (e.target === $("modal-back")) $("modal-back").hidden = true; });
  function copy(text, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => toast(done, "ok"), () => modal("Copy this text", text, [{ label: "Close" }]));
    else modal("Copy this text", text, [{ label: "Close" }]);
  }

  $("repo-link").href = D.repoUrl;
  $("about-link").addEventListener("click", (e) => {
    e.preventDefault();
    modal("What am I looking at?", [
      "This page shows the Bob Readiness plugin for IBM Bob IDE without installing anything.",
      "",
      "Real: every number and every finding. They come from the Blindspot exam that real IBM Bob sat closed book on tinydb v4.9.0: 200 questions, run C1 (Bob's own context) and run C2 (plus Blindspot's notes). The side panel on the right is the plugin's own panel code and the plugin's own state builders, fed with the published readiness context.",
      "",
      "Played: IBM Bob, git and the test run. When you approve a change, a scripted fake Bob edits the shown file, the tests 'pass' and the branch is pretend. No network call is made from this page. In the plugin the same flow spawns headless Bob on a real branch and runs pytest.",
      "",
      "Try: hover the red lines in operations.py; tick F004 and F011 in the Review tab and press Send to Bob; ask a question in Onboarding; press the blue switch at the top to see the same repository after Blindspot's notes were added.",
    ].join("\n"), [{ label: "Close", primary: true }]);
  });

  // ---------- start ----------
  renderSwitch();
  renderTree();
  openFile("tinydb/operations.py", 36);
  renderStatus();
  setTimeout(() => toast("Hover the red lines. Tick F004 and F011 in the Review tab, then Send to Bob. Everything here is the real exam data; only Bob is played.", "ok", [{ label: "What am I looking at?", fn: () => $("about-link").click() }]), 800);
})();
