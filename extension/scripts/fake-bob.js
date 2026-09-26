#!/usr/bin/env node
/*
 * fake-bob.js: a stand-in for headless Bob during development. It never costs Bobcoins.
 *
 * Usage: node scripts/fake-bob.js [any flags...] "<prompt>"
 * The prompt is the last argument. If the last argument is "-" or missing, stdin is read.
 *
 * Editing tasks: every line "FILE: <path> LINE: <n>" in the prompt gets a comment
 * "# fake-bob: reviewed" appended after line n of that file (relative to the current directory).
 * Onboarding questions (prompts that say "Do not edit any files") get a canned answer instead.
 *
 * Output mimics `bob run --format json` as recorded in docs/gonogo.md: a few log lines, then one
 * JSON line {"type":"result","status":"success","last_message":...,"stats":{...}} with a cost of 0.0.
 */
const fs = require("fs");
const path = require("path");

function readPrompt() {
  const args = process.argv.slice(2);
  const last = args[args.length - 1];
  if (last !== undefined && last !== "-" && !last.startsWith("--")) return last;
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function log(line) {
  const t = new Date().toISOString().slice(11, 19);
  console.log(`[fake-bob ${t}] ${line}`);
}

function editFiles(prompt) {
  const targets = [];
  const re = /^FILE:\s*(\S+)\s+LINE:\s*(\d+)\s*$/gm;
  let m;
  while ((m = re.exec(prompt)) !== null) targets.push({ file: m[1], line: Number(m[2]) });

  const touched = new Map(); // file -> list of lines (kept in memory so several edits to one file work)
  for (const t of targets) {
    const abs = path.resolve(process.cwd(), t.file);
    if (!fs.existsSync(abs)) {
      log(`skipping ${t.file}: not found`);
      continue;
    }
    if (!touched.has(abs)) touched.set(abs, { lines: fs.readFileSync(abs, "utf8").split("\n"), inserted: 0, file: t.file });
    const entry = touched.get(abs);
    const idx = Math.min(Math.max(t.line, 1), entry.lines.length) - 1 + entry.inserted;
    const nextLine = entry.lines[idx + 1] ?? entry.lines[idx] ?? "";
    const indent = (nextLine.match(/^\s*/) || [""])[0];
    entry.lines.splice(idx + 1, 0, `${indent}# fake-bob: reviewed`);
    entry.inserted += 1;
    log(`editing ${t.file} at line ${t.line}`);
  }
  for (const [abs, entry] of touched) fs.writeFileSync(abs, entry.lines.join("\n"));
  return { edited: [...touched.values()].map((e) => e.file), count: targets.length };
}

function answerQuestion(prompt) {
  const lines = prompt.trim().split("\n").filter((l) => l.trim());
  const question = lines[lines.length - 1] || "your question";
  return (
    `Fake Bob answer to "${question.trim()}". In tinydb, data is written by the storage class ` +
    "(JSONStorage in storages.py). With CachingMiddleware, writes are held in memory and saved when " +
    "the cache is full, on flush(), or on close(). This is a canned answer from scripts/fake-bob.js."
  );
}

const prompt = readPrompt();
log("reading .bob/rules/readiness-context.md");
let message;
let toolCalls = 0;
if (/Do not edit any files/i.test(prompt)) {
  message = answerQuestion(prompt);
} else {
  const result = editFiles(prompt);
  toolCalls = result.count;
  message =
    result.count === 0
      ? "No FILE/LINE targets found in the prompt. Nothing changed."
      : `Done. Added a review comment at ${result.count} place(s) in ${result.edited.join(", ")}.`;
}
log("done");
console.log(
  JSON.stringify({
    type: "result",
    status: "success",
    last_message: message,
    stats: { task_id: "fake-bob", total_tokens: 0, session_costs: 0.0, tool_calls: toolCalls },
    cost: 0.0,
  }),
);
process.exit(0);
