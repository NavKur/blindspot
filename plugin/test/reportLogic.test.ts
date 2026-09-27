import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseHistory, parseReport, type Report } from "../src/report/reportContract";
import {
  alignSeries,
  compareReports,
  fileSparkline,
  formatWhen,
  guessRepoName,
  heatBucket,
  historySeries,
  modulesWorstFirst,
  polylinePoints,
  timeAxis,
  treeDecoration,
} from "../src/report/reportLogic";

const report = (() => {
  const r = parseReport(fs.readFileSync(path.resolve(__dirname, "../fixtures/report.sample.json"), "utf8"));
  if (!r.ok) throw new Error("fixture invalid");
  return r.report;
})();
const history = parseHistory(fs.readFileSync(path.resolve(__dirname, "../fixtures/history.sample.jsonl"), "utf8")).lines;

describe("heat and tree colouring", () => {
  it("buckets heat", () => {
    expect(heatBucket(0)).toBe(0);
    expect(heatBucket(0.19)).toBe(0);
    expect(heatBucket(0.2)).toBe(1);
    expect(heatBucket(0.59)).toBe(2);
    expect(heatBucket(0.8)).toBe(4);
    expect(heatBucket(1)).toBe(4);
  });

  it("gives red modules a red badge and low_n a few answers marker", () => {
    const init = report.modules.find((m) => m.path === "tinydb/__init__.py")!;
    const d = treeDecoration(init, "module");
    expect(d.colorId).toBe("blindspot.red");
    expect(d.badge).toBe("!?");
    expect(d.tooltip).toContain("Red:");
    expect(d.tooltip).toContain("Few answers (3)");
    const queries = report.modules.find((m) => m.path === "tinydb/queries.py")!;
    const q = treeDecoration(queries, "module");
    expect(q.colorId).toBe("blindspot.heat0");
    expect(q.badge).toBeUndefined();
    const ops = report.modules.find((m) => m.path === "tinydb/operations.py")!;
    expect(treeDecoration(ops, "module").badge).toBe("?");
  });
});

describe("ordering and comparison", () => {
  it("puts red modules first, worst first", () => {
    const order = modulesWorstFirst(report.modules).map((m) => m.module);
    expect(order.slice(0, 2)).toEqual(["tinydb", "tinydb.utils"]);
    expect(order.length).toBe(8);
  });

  it("compares two reports per module", () => {
    const other: Report = JSON.parse(JSON.stringify(report));
    other.modules = other.modules.filter((m) => m.path !== "tinydb/utils.py");
    other.modules[0].accuracy = 0.9;
    const deltas = compareReports(report, other);
    const init = deltas.find((d) => d.path === "tinydb/__init__.py")!;
    expect(init.accuracyDelta).toBeCloseTo(0.9 - report.modules[0].accuracy);
    expect(deltas[0].path).toBe("tinydb/__init__.py");
    const utils = deltas.find((d) => d.path === "tinydb/utils.py")!;
    expect(utils.accuracyB).toBeUndefined();
    expect(utils.accuracyDelta).toBeUndefined();
  });
});

describe("history", () => {
  it("builds one series per condition and aligns them", () => {
    const series = historySeries(history, "accuracy");
    expect(series.map((s) => s.condition)).toEqual(["C0", "C1", "C2"]);
    const axis = timeAxis(series);
    expect(axis.length).toBe(3);
    expect(alignSeries(series[2], axis)).toEqual([series[2].points[0].y]);
    expect(alignSeries({ condition: "x", points: [{ x: axis[0], y: 0.5 }, { x: axis[2], y: 0.7 }] }, axis)).toEqual([0.5, 0.5, 0.7]);
  });

  it("makes sparkline values and svg points", () => {
    expect(fileSparkline(history, "tinydb/table.py").length).toBe(3);
    expect(fileSparkline(history, "nope.py")).toEqual([]);
    expect(polylinePoints([0, 1], 100, 20)).toBe("2.0,18.0 98.0,2.0");
    expect(polylinePoints([0.5], 100, 20)).toBe("2.0,10.0 98.0,10.0");
    expect(polylinePoints([], 100, 20)).toBe("");
  });

  it("formats times and guesses the repo name", () => {
    expect(formatWhen("2026-09-27T00:14:52+00:00")).toBe("27 Sep 2026, 00:14 UTC");
    expect(formatWhen("garbage")).toBe("garbage");
    expect(guessRepoName(report)).toBe("tinydb");
  });
});
