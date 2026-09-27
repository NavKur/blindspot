import { describe, expect, it } from "vitest";
import { ContextIndex } from "../src/contextIndex";
import { changedFiles, changedFunctions, computeVerdict, groupCommits, noteLines, notesMarkdown, type ChangedFunction } from "../src/releaseLogic";
import { loadFixture } from "./helpers";

const fn = (over: Partial<ChangedFunction>): ChangedFunction => ({
  id: "x", name: "Table.update", file: "tinydb/table.py", line: 1, status: "ok", statusLabel: "", tested: true, readiness: 1, ...over,
});

describe("computeVerdict", () => {
  it("is ready when tests pass and nothing wrong changed", () => {
    expect(computeVerdict([fn({ status: "ok" })], "passed").title).toBe("Ready to release");
    expect(computeVerdict([], "passed").kind).toBe("ready");
  });
  it("needs a check when a wrong or part function changed but is tested", () => {
    const v = computeVerdict([fn({ status: "wrong", tested: true, name: "CachingMiddleware.close" })], "passed");
    expect(v.title).toBe("Ready, with items to check");
    expect(v.reason).toContain("close() changed in an area where Bob was wrong before. It is tested.");
    expect(computeVerdict([fn({ status: "part" })], "passed").kind).toBe("check");
  });
  it("is not ready when a wrong function is untested or tests fail", () => {
    expect(computeVerdict([fn({ status: "wrong", tested: false })], "passed").title).toBe("Not ready");
    expect(computeVerdict([fn({ status: "ok" })], "failed").title).toBe("Not ready");
  });
  it("asks to run tests when they have not run", () => {
    expect(computeVerdict([], "unknown").reason).toContain("Run the tests");
  });
});

describe("commit grouping", () => {
  it("groups by conventional prefix", () => {
    const g = groupCommits(["fix: cached changes are saved (#128)", "feat(tests): tests for upsert()", "docs: readme", "Fix(table): scope", "plain subject"]);
    expect(g.fixed).toEqual(["cached changes are saved (#128)", "scope"]);
    expect(g.added).toEqual(["tests for upsert()"]);
    expect(g.other).toEqual(["readme", "plain subject"]);
    expect(noteLines(g)[0]).toBe("Fixed: cached changes are saved (#128)");
    const md = notesMarkdown(g, "v4.8.0", [{ path: "tinydb/table.py", label: "table.py", readiness: 0.7, known: true }]);
    expect(md).toContain("## Fixed");
    expect(md).toContain("- tinydb/table.py: 70%");
  });
});

describe("mapping changes to the context", () => {
  const index = new ContextIndex(loadFixture());
  it("maps changed ranges to overlapping functions, lowest readiness first", () => {
    const update = index.functionById("tinydb/table.py::Table.update")!;
    const insert = index.functionById("tinydb/table.py::Table.insert")!;
    const ranges = new Map([
      ["tinydb/table.py", [{ start: update.line_start + 2, end: update.line_start + 3 }, { start: insert.line_end, end: insert.line_end }]],
      ["README.rst", [{ start: 1, end: 1 }]],
    ]);
    const changed = changedFunctions(index, ranges);
    expect(changed.map((c) => c.name)).toEqual(["Table.update", "Table.insert"]);
    expect(changed[0].statusLabel).toBe("Sure but wrong");
  });
  it("labels changed files with readiness when known", () => {
    const files = changedFiles(index, ["tinydb/table.py", "README.rst"]);
    expect(files[0]).toEqual({ path: "tinydb/table.py", label: "table.py", readiness: 0.7, known: true });
    expect(files[1].known).toBe(false);
  });
});
