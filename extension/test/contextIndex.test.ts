import { describe, expect, it } from "vitest";
import { ContextIndex, normalizePath, relativeTo } from "../src/contextIndex";
import { loadFixture } from "./helpers";

describe("ContextIndex", () => {
  const index = new ContextIndex(loadFixture());

  it("finds functions and findings per file", () => {
    expect(index.functionsForFile("tinydb/table.py").map((f) => f.name)).toContain("Table.update");
    expect(index.findingsForFile("tinydb/table.py").map((f) => f.id)).toEqual(["F001", "F004"]);
    expect(index.functionsForFile("nope.py")).toEqual([]);
  });

  it("normalises windows paths and ./ prefixes", () => {
    expect(index.functionsForFile("./tinydb\\table.py").length).toBeGreaterThan(0);
    expect(normalizePath(".\\a\\b.py")).toBe("a/b.py");
  });

  it("looks up by id", () => {
    expect(index.findingById("F003")?.bob_allowed).toBe("no");
    expect(index.functionById("tinydb/table.py::Table.update")?.status).toBe("wrong");
    expect(index.findingsForFunction("tinydb/table.py::Table.update").map((f) => f.id)).toEqual(["F001"]);
  });

  it("lists known files", () => {
    expect(index.knownFiles()).toContain("tinydb/operations.py");
  });

  it("computes relative paths", () => {
    expect(relativeTo("/repo", "/repo/tinydb/table.py")).toBe("tinydb/table.py");
    expect(relativeTo("/repo/", "/repo/tinydb/table.py")).toBe("tinydb/table.py");
    expect(relativeTo("/repo", "/other/x.py")).toBeUndefined();
    expect(relativeTo("C:\\repo", "C:\\repo\\a.py")).toBe("a.py");
  });
});
