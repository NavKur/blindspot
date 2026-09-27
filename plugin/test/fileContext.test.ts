import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { ContextIndex } from "../src/contextIndex";
import { fileContextText } from "../src/fileContext";
import { parseReport } from "../src/report/reportContract";
import { loadFixture } from "./helpers";

describe("fileContextText", () => {
  const index = new ContextIndex(loadFixture());
  const r = parseReport(fs.readFileSync(path.resolve(__dirname, "../fixtures/report.sample.json"), "utf8"));
  const module = r.ok ? r.report.modules.find((m) => m.path === "tinydb/table.py") : undefined;

  it("lists misconceptions, findings, notes and exam numbers", () => {
    const text = fileContextText({ relPath: "tinydb/table.py", index, module, notes: "- Table.update(): with no condition it updates every document." });
    expect(text).toContain("Things you were sure about but got wrong:");
    expect(text).toContain("Table.update: you believed update() raises ValueError");
    expect(text).toContain("Open findings here:");
    expect(text).toContain("F001 (review_risk, high)");
    expect(text).toContain("Exam result for this module (tinydb.table)");
    expect(text).toContain("Study notes for this repository:");
    expect(text).toContain("Well known: Table.insert");
    expect(text).not.toContain("—");
  });

  it("says when a file was never examined", () => {
    const text = fileContextText({ relPath: "setup.py", index });
    expect(text).toContain("has not been examined");
  });
});
