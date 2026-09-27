import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseHistory, parseReport } from "../src/report/reportContract";

const reportText = fs.readFileSync(path.resolve(__dirname, "../fixtures/report.sample.json"), "utf8");
const historyText = fs.readFileSync(path.resolve(__dirname, "../fixtures/history.sample.jsonl"), "utf8");

describe("report contract", () => {
  it("accepts the simulated report", () => {
    const r = parseReport(reportText);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.report.simulated).toBe(true);
      expect(r.report.run.name).toBe("train_C2_r1");
      expect(r.report.modules.length).toBe(8);
      expect(r.report.red_modules).toEqual(["tinydb", "tinydb.utils"]);
      expect(r.report.targeted_modules?.length).toBe(5);
    }
  });

  it("rejects the wrong schema version and missing fields", () => {
    const broken = JSON.parse(reportText);
    broken.schema_version = 2;
    expect(parseReport(JSON.stringify(broken)).ok).toBe(false);
    const missing = JSON.parse(reportText);
    delete missing.modules[0].heat;
    const r = parseReport(JSON.stringify(missing));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems[0].path).toBe("modules.0.heat");
    expect(parseReport("nope").ok).toBe(false);
  });

  it("defaults simulated to false when absent", () => {
    const d = JSON.parse(reportText);
    delete d.simulated;
    const r = parseReport(JSON.stringify(d));
    expect(r.ok && r.report.simulated).toBe(false);
  });

  it("parses history lines in time order and skips bad lines", () => {
    const { lines, skipped } = parseHistory(historyText + "\nnot json\n{\"run\":\"x\"}\n");
    expect(lines.length).toBe(3);
    expect(skipped).toBe(2);
    expect(lines.map((l) => l.condition)).toEqual(["C0", "C1", "C2"]);
    expect(lines[0].modules["tinydb/table.py"]).toBeDefined();
  });
});
