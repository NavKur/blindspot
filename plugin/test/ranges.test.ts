import { describe, expect, it } from "vitest";
import { ContextIndex } from "../src/contextIndex";
import { clampRange, decorationRangesForFile, severityToLevel, truncate } from "../src/ranges";
import { loadFixture } from "./helpers";

describe("decorationRangesForFile", () => {
  const index = new ContextIndex(loadFixture());

  it("puts wrong and part functions in their buckets and findings in the gutter bucket", () => {
    const r = decorationRangesForFile(index, "tinydb/table.py");
    const update = index.functionById("tinydb/table.py::Table.update")!;
    expect(r.wrong).toContainEqual({ startLine: update.line_start, endLine: update.line_end });
    const search = index.functionById("tinydb/table.py::Table.search")!;
    expect(r.part).toContainEqual({ startLine: search.line_start, endLine: search.line_end });
    // insert is ok: no highlight at all
    const insert = index.functionById("tinydb/table.py::Table.insert")!;
    expect(r.wrong).not.toContainEqual({ startLine: insert.line_start, endLine: insert.line_end });
    expect(r.part).not.toContainEqual({ startLine: insert.line_start, endLine: insert.line_end });
    expect(r.finding.length).toBe(2);
  });

  it("adds a truncated inline hint on the def line of wrong functions", () => {
    const r = decorationRangesForFile(index, "tinydb/table.py");
    const update = index.functionById("tinydb/table.py::Table.update")!;
    const hint = r.hints.find((h) => h.line === update.line_start);
    expect(hint?.text.startsWith("Sure but wrong (92%): Bob believed")).toBe(true);
    expect(hint!.text.length).toBeLessThanOrEqual(80);
  });

  it("returns nothing for unknown files", () => {
    const r = decorationRangesForFile(index, "setup.py");
    expect(r).toEqual({ wrong: [], part: [], finding: [], hints: [] });
  });
});

describe("helpers", () => {
  it("truncates", () => {
    expect(truncate("abc", 10)).toBe("abc");
    expect(truncate("abcdefghijkl", 10)).toBe("abcdefg...");
  });
  it("clamps ranges", () => {
    expect(clampRange({ startLine: 5, endLine: 50 }, 20)).toEqual({ startLine: 5, endLine: 20 });
    expect(clampRange({ startLine: 30, endLine: 40 }, 20)).toBeUndefined();
    expect(clampRange({ startLine: 1, endLine: 2 }, 0)).toBeUndefined();
  });
  it("maps severities", () => {
    expect(severityToLevel("high")).toBe("warning");
    expect(severityToLevel("medium")).toBe("information");
    expect(severityToLevel("low")).toBe("hint");
  });
});
