import * as crypto from "node:crypto";

export function nonce(): string {
  return crypto.randomBytes(16).toString("base64");
}

/**
 * The panel page. All data arrives later through postMessage as a PanelState; the script
 * below renders it. Strict CSP: only our nonce'd script and inline styles from this file.
 */
export function panelHtml(cspSource: string, scriptNonce: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'nonce-${scriptNonce}'; script-src 'nonce-${scriptNonce}'; img-src ${cspSource} data:; font-src ${cspSource};">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Bob Readiness</title>
<style nonce="${scriptNonce}">
:root {
  --red: #fa4d56; --blue: #4589ff; --yellow: #f1c21b; --green: #24a148;
  --red-bg: rgba(250,77,86,0.22); --blue-bg: rgba(69,137,255,0.28); --green-bg: rgba(36,161,72,0.28);
}
* { box-sizing: border-box; }
html, body { height: 100%; margin: 0; padding: 0; }
body {
  font-family: "IBM Plex Sans", var(--vscode-font-family), system-ui, sans-serif;
  font-size: 13px; line-height: 1.45;
  color: var(--vscode-foreground); background: var(--vscode-sideBar-background, var(--vscode-editor-background));
  display: flex; flex-direction: column; height: 100vh; overflow: hidden;
}
button, input { font-family: inherit; font-size: 13px; border-radius: 0; }
button { cursor: pointer; }
button:disabled { cursor: default; opacity: 0.5; }
a { color: var(--vscode-textLink-foreground); }
.mono { font-family: "IBM Plex Mono", var(--vscode-editor-font-family), monospace; font-size: 12px; }
.muted { color: var(--vscode-descriptionForeground); }

header { padding: 10px 12px 0; border-bottom: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, transparent)); }
.title { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--vscode-sideBarTitle-foreground, var(--vscode-foreground)); }
.stats { display: flex; gap: 18px; margin: 10px 0 8px; }
.stat b { display: block; font-size: 18px; font-weight: 400; line-height: 1.1; }
.stat span { font-size: 11px; color: var(--vscode-descriptionForeground); }
.tabs { display: flex; gap: 0; margin: 0 -12px; padding: 0 4px; overflow-x: auto; }
.tab { background: none; border: none; border-bottom: 2px solid transparent; color: var(--vscode-descriptionForeground); padding: 6px 8px; }
.tab.active { color: var(--vscode-foreground); border-bottom-color: var(--vscode-focusBorder, var(--blue)); }
.tab:hover { color: var(--vscode-foreground); }

main { flex: 1; overflow-y: auto; padding: 10px 12px; }
.empty { padding: 20px 4px; color: var(--vscode-descriptionForeground); }
h3 { font-size: 13px; margin: 14px 0 6px; font-weight: 600; }
h3:first-child { margin-top: 0; }

.row { display: flex; gap: 10px; border: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, #3c3c3c)); padding: 10px; margin-bottom: 8px; background: var(--vscode-editorWidget-background, transparent); }
.row.disabled { opacity: 0.85; }
.row input[type=checkbox] { margin: 3px 0 0; flex: none; width: 15px; height: 15px; }
.row .body { flex: 1; min-width: 0; }
.row .head { display: flex; align-items: baseline; gap: 6px; }
.sev { display: inline-block; width: 8px; height: 8px; flex: none; position: relative; top: -1px; }
.sev.high { background: var(--red); } .sev.medium { background: var(--yellow); } .sev.low { background: var(--blue); }
.row .ttl { font-weight: 600; }
.row .loc { margin: 2px 0; }
.row .loc a { color: var(--blue); text-decoration: none; cursor: pointer; }
.row .loc a:hover { text-decoration: underline; }
.row .fn { margin-left: 8px; color: var(--vscode-descriptionForeground); }
.row .detail { margin: 2px 0; }
.row .rec { margin: 2px 0; color: var(--vscode-descriptionForeground); }
.gate { display: block; margin-top: 8px; padding: 3px 8px; font-size: 12px; color: var(--vscode-foreground); }
.gate.yes { background: var(--green-bg); } .gate.with_notes { background: var(--blue-bg); } .gate.no { background: var(--red-bg); }

footer { border-top: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, transparent)); padding: 10px 12px; }
.totals { display: flex; justify-content: space-between; margin-bottom: 8px; }
.btn { width: 100%; padding: 8px 12px; border: 1px solid var(--vscode-button-border, transparent); background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
.btn:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
.btn.secondary { background: var(--vscode-button-secondaryBackground, transparent); color: var(--vscode-button-secondaryForeground, var(--vscode-foreground)); border-color: var(--vscode-button-border, var(--vscode-contrastBorder, #6f6f6f)); }
.btn.secondary:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground); }
.btn + .btn { margin-top: 8px; }
.btns { display: flex; gap: 8px; } .btns .btn { flex: 1; margin: 0; }

pre.code { background: var(--vscode-textCodeBlock-background, rgba(127,127,127,0.15)); padding: 10px; margin: 0 0 8px; white-space: pre-wrap; }
.card { border: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, #3c3c3c)); padding: 8px 10px; margin-bottom: 8px; cursor: pointer; }
.card:hover { background: var(--vscode-list-hoverBackground); }
.card b { display: block; font-weight: 600; }

.kv { display: flex; justify-content: space-between; padding: 3px 0; }
.bar { height: 6px; background: var(--vscode-progressBar-background, #3c3c3c); opacity: 1; margin: 4px 0 10px; }
.bar > i { display: block; height: 100%; }
.verdict { border: 1px solid var(--yellow); padding: 10px; margin: 10px 0; }
.verdict.ready { border-color: var(--green); } .verdict.not-ready { border-color: var(--red); }
.verdict b { display: block; margin-bottom: 4px; }
.notes p { margin: 4px 0; }

.chat { display: flex; flex-direction: column; gap: 8px; }
.msg { max-width: 92%; padding: 8px 10px; }
.msg.q { align-self: flex-end; background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
.msg.a { align-self: flex-start; background: var(--vscode-textCodeBlock-background, rgba(127,127,127,0.15)); }
.msg .cost { display: block; margin-top: 4px; font-size: 11px; color: var(--vscode-descriptionForeground); }
.msg.a .cost { color: var(--vscode-descriptionForeground); }
.suggest { margin-top: 8px; }
.ask { display: flex; gap: 6px; margin-top: 8px; }
.ask input { flex: 1; padding: 6px 8px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, transparent); }
.ask input:focus { outline: 1px solid var(--vscode-focusBorder); }
.notice { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 6px; }

.result h2 { font-size: 15px; margin: 0 0 10px; font-weight: 600; }

.banner { background: var(--yellow); color: #161616; padding: 6px 10px; font-weight: 600; margin-bottom: 10px; }
.grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px 14px; margin: 6px 0 10px; }
.grid .stat b { font-size: 16px; }
.heat { display: inline-block; width: 10px; height: 10px; flex: none; position: relative; top: 1px; margin-right: 6px; }
.h0 { background: #24a148; } .h1 { background: #8fd14f; } .h2 { background: #f1c21b; } .h3 { background: #ff832b; } .h4 { background: #da1e28; }
.hred { background: var(--red); outline: 2px solid var(--red); outline-offset: 1px; }
.mod { border: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, #3c3c3c)); padding: 8px 10px; margin-bottom: 6px; }
.mod .top { display: flex; align-items: center; gap: 6px; }
.mod .top a { cursor: pointer; color: var(--blue); text-decoration: none; font-weight: 600; }
.mod .top a:hover { text-decoration: underline; }
.mod .nums { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 4px; color: var(--vscode-descriptionForeground); font-size: 12px; }
.mod .reasons { color: var(--red); font-size: 12px; margin-top: 3px; }
.tag { display: inline-block; font-size: 11px; padding: 0 6px; margin-left: auto; }
.tag.red { background: var(--red-bg); } .tag.few { background: rgba(241,194,27,0.28); }
svg.spark { vertical-align: middle; margin-left: auto; }
svg.spark polyline, svg.chart polyline { fill: none; stroke-width: 1.5; }
.chart-wrap { margin: 6px 0 10px; }
.legend { display: flex; gap: 12px; font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 2px; }
.legend i { display: inline-block; width: 10px; height: 3px; vertical-align: middle; margin-right: 4px; }
.c0 { stroke: #8a3ffc; background: #8a3ffc; } .c1 { stroke: #4589ff; background: #4589ff; } .c2 { stroke: #24a148; background: #24a148; } .c3 { stroke: #ff832b; background: #ff832b; }
table.cmp { width: 100%; border-collapse: collapse; font-size: 12px; }
table.cmp th, table.cmp td { text-align: left; padding: 3px 4px; border-bottom: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, #3c3c3c)); }
table.cmp td.up { color: var(--green); } table.cmp td.down { color: var(--red); }
.selects { display: flex; gap: 6px; align-items: center; margin: 6px 0; }
select { font-family: inherit; font-size: 12px; background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground); border: 1px solid var(--vscode-dropdown-border, transparent); padding: 3px; }
.bins { display: flex; gap: 4px; align-items: flex-end; height: 50px; margin: 4px 0; }
.bins .bin { flex: 1; text-align: center; font-size: 10px; color: var(--vscode-descriptionForeground); display: flex; flex-direction: column; justify-content: flex-end; height: 100%; }
.bins .bin i { display: block; background: var(--blue); min-height: 1px; }
.bins .bin.empty i { background: transparent; border-top: 1px dashed var(--vscode-descriptionForeground); }
pre.out { background: var(--vscode-textCodeBlock-background, rgba(127,127,127,0.15)); padding: 8px; font-size: 11px; white-space: pre-wrap; max-height: 200px; overflow: auto; margin: 6px 0; }
.files .kv span:last-child { font-family: var(--vscode-editor-font-family), monospace; font-size: 12px; }
.files .kv a { cursor: pointer; text-decoration: none; color: var(--vscode-foreground); }
.files .kv a:hover { text-decoration: underline; }
.plus { color: var(--green); } .minus { color: var(--red); margin-left: 6px; }
.tests { border: 1px solid var(--green); padding: 8px 10px; margin: 10px 0; }
.tests.fail { border-color: var(--red); }
.tests.running { border-color: var(--yellow); }
.tests pre { margin: 6px 0 0; white-space: pre-wrap; font-size: 11px; max-height: 160px; overflow: auto; }
.spin { display: inline-block; width: 10px; height: 10px; border: 2px solid var(--vscode-descriptionForeground); border-top-color: transparent; border-radius: 50%; animation: spin 0.9s linear infinite; vertical-align: -1px; margin-right: 6px; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
<header>
  <div class="title" id="title">BOB READINESS</div>
  <div class="stats" id="stats"></div>
  <div class="tabs" id="tabs"></div>
</header>
<main id="main"></main>
<footer id="footer"></footer>
<script nonce="${scriptNonce}">
(function () {
  const vscode = acquireVsCodeApi();
  const TABS = [
    ["exam", "Exam"], ["onboarding", "Onboarding"], ["review", "Review"], ["testing", "Testing"], ["release", "Release"], ["modernize", "Modernize"],
  ];
  let state = null;
  let draft = "";

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const post = (msg) => vscode.postMessage(msg);

  window.addEventListener("message", (e) => {
    const m = e.data;
    if (m && m.type === "state") { state = m.state; render(); }
  });

  function render() {
    if (!state) return;
    renderHeader();
    renderTabs();
    renderMain();
    renderFooter();
  }

  function renderHeader() {
    const h = state.header;
    $("title").textContent = "BOB READINESS: " + h.repoName.toUpperCase();
    $("stats").innerHTML =
      '<div class="stat"><b>' + esc(h.readiness) + '</b><span>readiness</span></div>' +
      '<div class="stat"><b>' + esc(h.sureButWrong) + '</b><span>sure but wrong</span></div>' +
      '<div class="stat" title="' + esc(h.sessionCoins) + ' Bobcoins spent by this extension in this session. The study that produced the context cost ' + esc(h.studyCoins) + ' Bobcoins."><b>' + esc(h.sessionCoins) + '</b><span>Bobcoins used</span></div>';
  }

  function renderTabs() {
    $("tabs").innerHTML = TABS.map(([id, label]) =>
      '<button class="tab' + (state.activeTab === id ? " active" : "") + '" data-tab="' + id + '">' + label + "</button>").join("");
  }

  function renderMain() {
    const main = $("main");
    if (state.run && state.activeTab !== "onboarding" && state.activeTab !== "release") { main.innerHTML = renderRun(state.run); return; }
    switch (state.activeTab) {
      case "review": main.innerHTML = renderFindings(state.tabs.review, "No review risks in the context file."); break;
      case "testing": main.innerHTML = renderFindings(state.tabs.testing, "No test gaps in the context file."); break;
      case "modernize": main.innerHTML = renderFindings(state.tabs.modernize, "No modernization findings in the context file."); break;
      case "release": main.innerHTML = renderRelease(state.release); break;
      case "exam": main.innerHTML = renderExam(state.exam); break;
      case "onboarding": main.innerHTML = renderOnboarding(state.onboarding); break;
    }
    if (state.activeTab === "onboarding") {
      const input = $("ask-input");
      if (input) { input.value = draft; }
      const chat = $("chat-end"); if (chat) chat.scrollIntoView({ block: "end" });
    }
  }

  function renderFindings(rows, emptyText) {
    if (!state.hasContext) return '<div class="empty">No context file found. Expected .bob/context/readiness.json in the workspace.</div>';
    if (!rows.length) return '<div class="empty">' + esc(emptyText) + "</div>";
    return rows.map((r) =>
      '<div class="row' + (r.disabled ? " disabled" : "") + '">' +
        '<input type="checkbox" data-id="' + esc(r.id) + '"' + (r.selected ? " checked" : "") + (r.disabled ? " disabled" : "") +
          ' title="' + (r.disabled ? "Needs a person. This finding cannot be sent to Bob." : "Tick to add " + esc(r.id) + " to the Bob queue") + '">' +
        '<div class="body">' +
          '<div class="head"><i class="sev ' + r.severity + '" title="' + r.severity + ' severity"></i><span class="ttl">' + esc(r.title) + "</span></div>" +
          '<div class="loc mono"><a data-open="' + esc(r.file) + '" data-line="' + r.line + '" title="' + esc(r.file) + '">' + esc(r.fileLabel) + '</a><span class="fn">' + esc(r.functionName) + "</span></div>" +
          '<div class="detail">' + esc(r.detail) + "</div>" +
          '<div class="rec">' + esc(r.recommendation) + "</div>" +
          '<span class="gate ' + r.gate + '">' + esc(r.gateLabel) + "</span>" +
        "</div>" +
      "</div>").join("");
  }

  function renderRelease(r) {
    if (!r) return '<div class="empty">Release data is computed from git. Open a git repository to see it.</div>';
    if (r.error) return '<div class="empty">' + esc(r.error) + "</div>";
    let html =
      '<div class="kv"><span>Since tag</span><span class="mono">' + esc(r.sinceLabel) + "</span></div>" +
      '<div class="kv"><span>Commits</span><span>' + r.commitCount + "</span></div>" +
      '<div class="kv"><span>Functions changed</span><span>' + r.changedFunctions.length + "</span></div>";
    html += "<h3>Readiness of changed files</h3>";
    if (!r.changedFiles.length) html += '<div class="muted">No files changed since ' + esc(r.sinceLabel) + ".</div>";
    for (const f of r.changedFiles) {
      const pct = Math.round(f.readiness * 100);
      const color = f.readiness >= 0.85 ? "var(--green)" : f.readiness >= 0.65 ? "var(--blue)" : "var(--red)";
      html += '<div class="kv"><a class="mono" data-open="' + esc(f.path) + '" data-line="1">' + esc(f.label) + "</a><span>" + (f.known ? pct + "%" : "not studied") + "</span></div>" +
        '<div class="bar"><i style="width:' + (f.known ? pct : 0) + "%;background:" + color + '"></i></div>';
    }
    if (r.changedFunctions.length) {
      html += "<h3>Changed functions</h3>";
      for (const fn of r.changedFunctions) {
        html += '<div class="kv"><a class="mono" data-open="' + esc(fn.file) + '" data-line="' + fn.line + '">' + esc(fn.name) + "</a><span>" + esc(fn.statusLabel) + (fn.tested ? ", tested" : ", not tested") + "</span></div>";
      }
    }
    html += '<div class="verdict ' + r.verdict.kind + '"><b>' + esc(r.verdict.title) + "</b>" + esc(r.verdict.reason) + "</div>";
    html += '<h3>Draft release notes</h3><div class="notes">' + (r.notes.length ? r.notes.map((n) => "<p>" + esc(n) + "</p>").join("") : '<p class="muted">No commits since ' + esc(r.sinceLabel) + ".</p>") + "</div>";
    if (r.tests) {
      html += '<div class="tests ' + r.tests.kind + '"><b>' + esc(r.tests.title) + "</b> " + esc(r.tests.summary) + (r.tests.output ? "<pre>" + esc(r.tests.output) + "</pre>" : "") + "</div>";
    }
    return html;
  }

  function renderOnboarding(o) {
    if (!o) return '<div class="empty">No context file found. Expected .bob/context/readiness.json in the workspace.</div>';
    let html = "<h3>Set up</h3>";
    html += '<pre class="code mono">' + esc(o.setup.join("\\n")) + "</pre>";
    if (o.starterTasks.length) {
      html += "<h3>Good first tasks</h3>";
      for (const t of o.starterTasks) {
        html += '<div class="card" data-open="' + esc(t.file) + '" data-line="1"><b>' + esc(t.title) + '</b><span class="muted">' + esc(t.why) + "</span></div>";
      }
    }
    html += "<h3>Ask about this codebase</h3>";
    html += '<div class="chat">';
    for (const m of o.messages) {
      html += '<div class="msg q">' + esc(m.question) + "</div>";
      if (m.pending) html += '<div class="msg a"><span class="spin"></span>Asking Bob...</div>';
      else html += '<div class="msg a">' + esc(m.answer) + '<span class="cost">' + esc(m.costLabel) + "</span></div>";
    }
    html += '<div id="chat-end"></div></div>';
    html += '<div class="suggest">' + o.suggested.map((q) => '<button class="btn secondary" data-ask="' + esc(q) + '">' + esc(q) + "</button>").join("") + "</div>";
    html += '<div class="ask"><input id="ask-input" type="text" placeholder="Ask a question..."' + (o.busy ? " disabled" : "") + '><button class="btn" id="ask-btn" style="width:auto"' + (o.busy ? " disabled" : "") + ">Ask</button></div>";
    html += '<div class="notice">Each new question costs about 1 Bobcoin. Repeated questions are free.</div>';
    return html;
  }

  function renderExam(x) {
    if (!x) return '<div class="empty">No Blindspot report found. Expected results/report_latest.json (or results/sim/report_latest.json for simulated data) in the workspace. Run "python cli.py report" or "python cli.py simulate".</div>';
    let html = "";
    if (x.simulated || x.usingSim) html += '<div class="banner">Simulated data' + (x.usingSim ? " from results/sim" : "") + '. Not a real Bob run.</div>';
    if (x.error) html += '<div class="tests fail"><b>Report problem</b> ' + esc(x.error) + "</div>";
    html += '<div class="kv"><span>Run</span><span class="mono">' + esc(x.run.name) + "</span></div>" +
      '<div class="kv"><span>Condition</span><span>' + esc(x.run.condition) + ", " + esc(x.run.set) + " set, repeat " + x.run.repeat + "</span></div>" +
      '<div class="kv"><span>Generated</span><span>' + esc(x.generatedAt) + "</span></div>" +
      '<div class="kv"><span>Target commit</span><span class="mono">' + esc(x.targetCommit) + "</span></div>" +
      '<div class="kv"><span>Answers</span><span>' + x.counts.scored + " scored, " + x.counts.excluded + " excluded</span></div>";
    html += '<h3>Overall</h3><div class="grid">' +
      stat(x.overall.accuracy, "accuracy, 95% interval " + x.overall.interval) +
      stat(x.overall.cw, "confidently wrong (" + x.overall.cwCount + ")") +
      stat(x.overall.brier, "Brier score, lower is better") +
      stat(x.overall.ece, "calibration error (ECE)") +
      stat(x.overall.overconfidence, "overconfidence (stated minus actual)") +
      stat(x.overall.meanP, "mean stated confidence") + "</div>";
    html += '<h3>Reliability</h3><div class="bins">' + x.reliability.map((b) =>
      '<div class="bin' + (b.n ? "" : " empty") + '" title="' + esc(b.label) + ": " + b.n + " answers" + (b.accuracy == null ? "" : ", accuracy " + Math.round(b.accuracy * 100) + "%, stated " + Math.round(b.meanP * 100) + "%") + '"><i style="height:' + (b.accuracy == null ? 0 : Math.max(2, Math.round(b.accuracy * 40))) + 'px"></i><span>' + esc(b.label.split(" to ")[0]) + "</span></div>").join("") + "</div>" +
      '<div class="muted" style="font-size:11px">Bars: accuracy inside each stated confidence band. Dashed: no answers in that band.</div>';
    if (x.history.axis.length > 1) {
      html += "<h3>Change over time</h3>" + chart("Accuracy", x.history.accuracy, x) + chart("Confidently wrong rate", x.history.cw, x);
    } else if (x.history.axis.length === 1) {
      html += '<h3>Change over time</h3><div class="muted">One report so far (' + esc(x.history.axis[0]) + "). The chart appears after the next run.</div>";
    }
    html += "<h3>Modules, worst first</h3>";
    if (x.redModules.length) html += '<div class="muted" style="margin-bottom:6px">Red: ' + esc(x.redModules.join(", ")) + "</div>";
    for (const m of x.modules) {
      html += '<div class="mod"><div class="top"><i class="heat ' + (m.red ? "hred" : "h" + m.bucket) + '" title="heat ' + m.heat.toFixed(2) + '"></i>' +
        '<a data-target="' + esc(m.path) + '" title="' + esc(m.path) + '">' + esc(m.module) + "</a>" +
        (m.red ? '<span class="tag red">red</span>' : "") + (m.lowN ? '<span class="tag few">few answers</span>' : "") +
        (m.spark ? '<svg class="spark" width="60" height="16" viewBox="0 0 60 16"><polyline class="c1" points="' + m.spark + '"></polyline></svg>' : "") + "</div>" +
        '<div class="nums"><span>accuracy ' + esc(m.accuracy) + " (" + esc(m.interval) + ")</span><span>confidently wrong " + esc(m.cw) + "</span><span>n " + m.n + "</span><span>overconfidence " + esc(m.overconfidence) + "</span></div>" +
        (m.families.length ? '<div class="nums">' + m.families.map((f) => "<span>" + esc(f.name) + " " + esc(f.accuracy) + "</span>").join("") + "</div>" : "") +
        (m.redReasons.length ? '<div class="reasons">' + esc(m.redReasons.join("; ")) + "</div>" : "") + "</div>";
    }
    if (x.worst.length) {
      html += "<h3>Worst functions and classes</h3>";
      for (const w of x.worst) {
        html += '<div class="kv"><a class="mono" data-target="' + esc(w.path) + '" style="cursor:pointer;color:var(--blue);text-decoration:none" title="' + esc(w.path) + '">' + esc(w.entity.split(":").pop()) + "</a><span>" + esc(w.accuracyLabel) + " of " + w.n + ", " + w.cw_count + " confidently wrong</span></div>";
      }
    }
    if (x.runs.length > 1) {
      const opts = (sel) => x.runs.map((r) => '<option value="' + esc(r) + '"' + (r === sel ? " selected" : "") + ">" + esc(r) + "</option>").join("");
      const a = (x.compare && x.compare.a) || x.runs[0];
      const b = (x.compare && x.compare.b) || x.runs[x.runs.length - 1];
      html += '<h3>Compare runs</h3><div class="selects"><select id="cmp-a">' + opts(a) + '</select><span>vs</span><select id="cmp-b">' + opts(b) + '</select><button class="btn secondary" id="cmp-go" style="width:auto">Compare</button></div>';
      if (x.compare) {
        html += '<table class="cmp"><tr><th>module</th><th>' + esc(x.compare.a) + "</th><th>" + esc(x.compare.b) + "</th><th>change</th></tr>" +
          x.compare.rows.map((r) => "<tr><td>" + esc(r.label) + (r.redA ? " (red)" : "") + (r.redB && !r.redA ? " (now red)" : "") + "</td><td>" + esc(r.a) + "</td><td>" + esc(r.b) + '</td><td class="' + (r.deltaValue > 0 ? "up" : r.deltaValue < 0 ? "down" : "") + '">' + esc(r.delta) + "</td></tr>").join("") + "</table>";
      }
    }
    if (x.publish) {
      html += "<h3>Publish</h3>" + (x.publish.running ? '<div class="muted"><span class="spin"></span>Running ' + esc(x.publish.command) + "</div>" :
        '<div class="tests ' + (x.publish.ok ? "" : "fail") + '"><b>' + (x.publish.ok ? "Published" : "Publish failed") + "</b> " + esc(x.publish.command) + "<pre>" + esc(x.publish.output) + "</pre></div>");
    }
    html += '<div class="muted" style="font-size:11px;margin-top:10px">Reading ' + esc(x.resultsDir) + "</div>";
    return html;
  }
  function stat(value, label) { return '<div class="stat"><b>' + esc(value) + "</b><span>" + esc(label) + "</span></div>"; }
  function chart(title, lines, x) {
    const w = x.history.width, h = x.history.height;
    return '<div class="chart-wrap"><div class="muted" style="font-size:11px">' + esc(title) + '</div><svg class="chart" width="100%" height="' + h + '" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none">' +
      '<line x1="0" y1="' + (h - 2) + '" x2="' + w + '" y2="' + (h - 2) + '" stroke="var(--vscode-descriptionForeground)" stroke-width="0.5"></line>' +
      lines.map((l, i) => '<polyline class="c' + (i % 4) + '" points="' + l.points + '"></polyline>').join("") + "</svg>" +
      '<div class="legend">' + lines.map((l, i) => '<span><i class="c' + (i % 4) + '"></i>' + esc(l.condition) + "</span>").join("") + "<span>" + esc(x.history.axis[0]) + " to " + esc(x.history.axis[x.history.axis.length - 1]) + "</span></div></div>";
  }

  function renderRun(run) {
    let html = '<div class="result"><h2>' + esc(run.title) + "</h2>";
    html += '<div class="kv"><span>Branch</span><span class="mono" style="color:var(--blue)">' + esc(run.branch) + "</span></div>";
    html += '<div class="kv"><span>Cost</span><span>' + esc(run.costLabel) + "</span></div>";
    if (run.stage) html += '<div class="kv muted"><span><span class="spin"></span>' + esc(run.stage) + "</span></div>";
    html += "<h3>Changed files</h3>";
    if (!run.files.length) html += '<div class="muted">' + (run.stage ? "Waiting for Bob." : "Bob changed no files.") + "</div>";
    html += '<div class="files">';
    for (const f of run.files) {
      html += '<div class="kv"><a class="mono" data-diff="' + esc(f.path) + '" title="Open the diff">' + esc(f.path) + '</a><span><span class="plus">+' + f.added + '</span><span class="minus">-' + f.removed + "</span></span></div>";
    }
    html += "</div>";
    if (run.tests) {
      html += '<div class="tests ' + run.tests.kind + '"><b>' + esc(run.tests.title) + "</b> " + esc(run.tests.summary) + (run.tests.output ? "<pre>" + esc(run.tests.output) + "</pre>" : "") + "</div>";
    }
    if (run.done.length) {
      html += "<h3>Done items</h3>";
      for (const d of run.done) html += '<div class="kv"><span>' + esc(d) + "</span></div>";
    }
    if (run.error) html += '<div class="tests fail"><b>Something went wrong</b> ' + esc(run.error) + "</div>";
    html += "</div>";
    return html;
  }

  function renderFooter() {
    const f = state.footer;
    const foot = $("footer");
    if (state.run && state.activeTab !== "onboarding" && state.activeTab !== "release") {
      foot.style.display = "";
      if (state.run.canDecide) {
        foot.innerHTML = '<div class="btns"><button class="btn" id="keep">Keep changes</button><button class="btn secondary" id="discard">Discard</button></div>';
      } else if (state.run.error) {
        foot.innerHTML = '<button class="btn secondary" id="dismiss">Back to findings</button>';
      } else {
        foot.innerHTML = '<button class="btn secondary" id="cancel">Cancel</button>';
      }
      return;
    }
    if (state.activeTab === "onboarding") { foot.style.display = "none"; return; }
    foot.style.display = "";
    if (state.activeTab === "exam") {
      foot.innerHTML = '<div class="btns"><button class="btn" id="publish"' + (!state.exam || (state.exam.publish && state.exam.publish.running) ? " disabled" : "") + ' title="Runs the publish command and shows its output. Never publish while an exam is running.">Publish context</button>' +
        '<button class="btn secondary" id="reload-report">Reload report</button></div>';
      return;
    }
    if (state.activeTab === "release") {
      foot.innerHTML = '<button class="btn secondary" id="run-tests"' + (state.release && state.release.tests && state.release.tests.kind === "running" ? " disabled" : "") + ">Run tests</button>" +
        '<button class="btn secondary" id="copy-notes">Copy release notes</button>';
      return;
    }
    foot.innerHTML =
      '<div class="totals"><span>Selected: ' + f.selected + ' (across tabs)</span><span>' + esc(f.coinsText) + "</span></div>" +
      '<button class="btn" id="send"' + (f.canSend ? "" : " disabled") + ">Send to Bob</button>";
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-tab],[data-open],[data-diff],[data-ask],[data-target],#send,#keep,#discard,#cancel,#dismiss,#run-tests,#copy-notes,#ask-btn,#publish,#reload-report,#cmp-go");
    if (!t) return;
    if (t.dataset.tab) { post({ type: "setTab", tab: t.dataset.tab }); return; }
    if (t.dataset.target) { post({ type: "openTargetFile", file: t.dataset.target }); return; }
    if (t.dataset.open) { post({ type: "openFile", file: t.dataset.open, line: Number(t.dataset.line || 1) }); return; }
    if (t.dataset.diff) { post({ type: "openDiff", file: t.dataset.diff }); return; }
    if (t.dataset.ask) { post({ type: "ask", question: t.dataset.ask }); return; }
    switch (t.id) {
      case "send": post({ type: "sendToBob" }); break;
      case "keep": post({ type: "keep" }); break;
      case "discard": post({ type: "discard" }); break;
      case "cancel": post({ type: "cancelRun" }); break;
      case "dismiss": post({ type: "dismissRun" }); break;
      case "run-tests": post({ type: "runTests" }); break;
      case "copy-notes": post({ type: "copyReleaseNotes" }); break;
      case "ask-btn": ask(); break;
      case "publish": post({ type: "publish" }); break;
      case "reload-report": post({ type: "reloadReport" }); break;
      case "cmp-go": post({ type: "compareRuns", a: $("cmp-a").value, b: $("cmp-b").value }); break;
    }
  });
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t && t.matches && t.matches("input[type=checkbox][data-id]")) {
      post({ type: "toggleFinding", id: t.dataset.id, selected: t.checked });
    }
  });
  document.addEventListener("input", (e) => {
    if (e.target && e.target.id === "ask-input") draft = e.target.value;
  });
  document.addEventListener("keydown", (e) => {
    if (e.target && e.target.id === "ask-input" && e.key === "Enter") ask();
  });
  function ask() {
    const q = draft.trim();
    if (!q) return;
    draft = "";
    post({ type: "ask", question: q });
  }

  post({ type: "ready" });
})();
</script>
</body>
</html>`;
}
