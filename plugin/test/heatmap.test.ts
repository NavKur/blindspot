import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { ContextIndex } from "../src/contextIndex";
import { buildHeatmap, functionsGrid, readinessBucket, runsGrid } from "../src/heatmap";
import { parseHistory, parseReport } from "../src/report/reportContract";
import { loadFixture } from "./helpers";

const report = (() => {
  const r = parseReport(fs.readFileSync(path.resolve(__dirname, "../fixtures/report.sample.json"), "utf8"));
  if (!r.ok) throw new Error("bad fixture");
  return r.report;
})();
const history = parseHistory(fs.readFileSync(path.resolve(__dirname, "../fixtures/history.sample.jsonl"), "utf8")).lines;

describe("heatmap", () => {
  it("builds a files over runs grid in time order, worst latest heat first", () => {
    const grid = runsGrid(history, report);
    expect(grid.columns.map((c) => c.condition)).toEqual(["C0", "C1", "C2"]);
    expect(grid.rows.length).toBe(8);
    expect(grid.rows[0].path).toBe("tinydb/__init__.py");
    expect(grid.rows[0].cells.every((c) => c !== null)).toBe(true);
    expect(grid.rows[0].cells[2]!.red).toBe(true);
  });

  it("adds the latest report as a column when history lags behind", () => {
    const grid = runsGrid(history.slice(0, 2), report);
    expect(grid.columns.length).toBe(3);
    expect(grid.columns[2].run).toBe("train_C2_r1");
  });

  it("builds a functions by file grid from the readiness context", () => {
    const index = new ContextIndex(loadFixture());
    const grid = functionsGrid(index);
    expect(grid.total).toBe(20);
    expect(grid.wrong).toBe(6);
    // files with a 0.25 readiness function come first, ties by name
    expect(grid.rows[0].path).toBe("tinydb/middlewares.py");
    expect(grid.rows[grid.rows.length - 1].worst).toBeGreaterThanOrEqual(grid.rows[0].worst);
    const table = grid.rows.find((r) => r.path === "tinydb/table.py")!;
    const update = table.cells.find((c) => c.name === "Table.update")!;
    expect(update.bucket).toBe(4);
    expect(update.red).toBe(true);
    expect(update.tooltip).toContain("Bob believed update() raises ValueError");
    expect(table.fileReadiness).toBe("70%");
    expect(functionsGrid(undefined).rows).toEqual([]);
  });

  it("buckets readiness and always puts wrong in the worst bucket", () => {
    expect(readinessBucket(1, "ok")).toBe(0);
    expect(readinessBucket(0.7, "part")).toBe(1);
    expect(readinessBucket(0.5, "part")).toBe(2);
    expect(readinessBucket(0.9, "wrong")).toBe(4);
  });

  it("combines both grids", () => {
    const view = buildHeatmap(history, report, new ContextIndex(loadFixture()));
    expect(view.runs.rows.length).toBe(8);
    expect(view.functions.rows.length).toBeGreaterThan(0);
    expect(view.legend.length).toBe(5);
  });
});
