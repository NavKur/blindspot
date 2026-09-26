import { describe, expect, it } from "vitest";
import { parseChangedRanges, parseNumstat, parseSubjects } from "../src/gitParse";

describe("git parsers", () => {
  it("parses numstat including binaries and renames", () => {
    const out = "3\t1\ttinydb/table.py\n14\t0\ttests/test_tables.py\n-\t-\timg.png\n1\t1\tdocs/{old => new}.md\n";
    expect(parseNumstat(out)).toEqual([
      { path: "tinydb/table.py", added: 3, removed: 1 },
      { path: "tests/test_tables.py", added: 14, removed: 0 },
      { path: "img.png", added: 0, removed: 0 },
      { path: "docs/new.md", added: 1, removed: 1 },
    ]);
  });

  it("parses -U0 hunks into new-side ranges", () => {
    const diff = [
      "diff --git a/tinydb/table.py b/tinydb/table.py",
      "--- a/tinydb/table.py",
      "+++ b/tinydb/table.py",
      "@@ -10,0 +11,2 @@ class Table:",
      "+a",
      "+b",
      "@@ -425 +427 @@ def update(",
      "-x",
      "+y",
      "@@ -500,2 +501,0 @@",
      "-gone",
      "-gone",
      "diff --git a/old.py b/old.py",
      "--- a/old.py",
      "+++ /dev/null",
      "@@ -1,3 +0,0 @@",
    ].join("\n");
    const ranges = parseChangedRanges(diff);
    expect(ranges.get("tinydb/table.py")).toEqual([
      { start: 11, end: 12 },
      { start: 427, end: 427 },
      { start: 501, end: 501 },
    ]);
    expect(ranges.has("old.py")).toBe(false);
  });

  it("parses subjects", () => {
    expect(parseSubjects("fix: a\n\nfeat: b\n")).toEqual(["fix: a", "feat: b"]);
  });
});
