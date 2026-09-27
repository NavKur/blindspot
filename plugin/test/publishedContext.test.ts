// Checks the files the engine really published into target/tinydb against the plugin's contracts.
// Skipped when nothing has been published yet (fresh checkout), so it never fails on CI.
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseContext } from "../src/contract";
import { parseHistory, parseReport } from "../src/report/reportContract";

const target = path.resolve(__dirname, "..", "..", "target", "tinydb");
const contextFile = path.join(target, ".bob", "context", "readiness.json");
const published = path.join(target, ".bob", "blindspot");
const have = fs.existsSync(contextFile);

describe.skipIf(!have)("published readiness context in target/tinydb", () => {
  it("matches the zod contract and points at files that exist", () => {
    const r = parseContext(fs.readFileSync(contextFile, "utf8"));
    expect(r.ok, r.ok ? "" : JSON.stringify(r.problems.slice(0, 3))).toBe(true);
    if (!r.ok) return;
    const ctx = r.context;
    expect(ctx.files.length).toBeGreaterThan(0);
    expect(ctx.functions.length).toBeGreaterThan(0);
    for (const f of ctx.files) expect(fs.existsSync(path.join(target, ...f.path.split("/"))), f.path).toBe(true);
    const ids = new Set(ctx.functions.map((f) => f.id));
    for (const finding of ctx.findings) expect(ids.has(finding.function_id), finding.id).toBe(true);
    expect(fs.existsSync(path.join(target, ...ctx.notes_markdown_path.split("/")))).toBe(true);
    // Line ranges must land inside the real file.
    for (const fn of ctx.functions) {
      const lines = fs.readFileSync(path.join(target, ...fn.file.split("/")), "utf8").split("\n").length;
      expect(fn.line_end, fn.id).toBeLessThanOrEqual(lines);
    }
  });

  it("ships report copies the Exam tab can read", () => {
    if (!fs.existsSync(path.join(published, "report_latest.json"))) return;
    const r = parseReport(fs.readFileSync(path.join(published, "report_latest.json"), "utf8"));
    expect(r.ok).toBe(true);
    const h = parseHistory(fs.readFileSync(path.join(published, "history.jsonl"), "utf8"));
    expect(h.skipped).toBe(0);
    expect(h.lines.length).toBeGreaterThan(0);
  });
});
