import { describe, expect, it } from "vitest";
import { ContextIndex } from "../src/contextIndex";
import { hoverMarkdownForLine } from "../src/hoverText";
import { loadFixture } from "./helpers";

describe("hoverMarkdownForLine", () => {
  const index = new ContextIndex(loadFixture());
  const update = index.functionById("tinydb/table.py::Table.update")!;

  it("describes a sure-but-wrong function with its finding and a queue link", () => {
    const md = hoverMarkdownForLine(index, "tinydb/table.py", update.line_start)!;
    expect(md).toContain("**Table.update** readiness 25%");
    expect(md).toContain("Sure but wrong");
    expect(md).toContain("Bob was **92% sure** that update() raises ValueError");
    expect(md).toContain("**Actually:** It raises nothing");
    expect(md).toContain("Finding F001, review risk, high");
    expect(md).toContain("command:bobReadiness.queueFinding?%5B%22F001%22%5D");
    expect(md).toContain("(Bob with notes, review needed)");
  });

  it("shows Needs a person instead of a link when bob_allowed is no", () => {
    const search = index.functionById("tinydb/queries.py::Query.search")!;
    const md = hoverMarkdownForLine(index, "tinydb/queries.py", search.line_start)!;
    expect(md).toContain("Needs a person");
    expect(md).not.toContain("command:bobReadiness.queueFinding");
  });

  it("offers to remove already queued findings", () => {
    const md = hoverMarkdownForLine(index, "tinydb/table.py", update.line_start, { queued: new Set(["F001"]) })!;
    expect(md).toContain("Remove from Bob queue");
  });

  it("returns nothing for ok functions and lines without findings", () => {
    const insert = index.functionById("tinydb/table.py::Table.insert")!;
    expect(hoverMarkdownForLine(index, "tinydb/table.py", insert.line_start)).toBeUndefined();
    expect(hoverMarkdownForLine(index, "tinydb/table.py", 1)).toBeUndefined();
  });
});
