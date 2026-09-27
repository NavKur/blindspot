import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { describeContextChange, describeReportChange } from "../src/changes";
import { parseReport } from "../src/report/reportContract";
import { fixtureCopy, loadFixture } from "./helpers";

describe("change summaries", () => {
  it("describes readiness context changes", () => {
    const before = loadFixture();
    const after = fixtureCopy();
    after.functions[1].readiness = 0.9; // search improved
    after.functions[0].status = "wrong"; // insert now wrong
    after.functions.push({ ...after.functions[2], id: "new::fn", name: "fn" });
    after.summary.readiness = 0.8;
    const text = describeContextChange(before, after)!;
    expect(text).toContain("1 function improved");
    expect(text).toContain("2 new sure but wrong");
    expect(text).toContain("1 added");
    expect(text).toContain("readiness 73% to 80%");
    expect(describeContextChange(undefined, after)).toBeUndefined();
    expect(describeContextChange(before, loadFixture())).toBeUndefined();
  });

  it("describes report changes", () => {
    const r = parseReport(fs.readFileSync(path.resolve(__dirname, "../fixtures/report.sample.json"), "utf8"));
    if (!r.ok) throw new Error("bad fixture");
    const before = JSON.parse(JSON.stringify(r.report));
    before.run.name = "train_C1_r1";
    before.overall.accuracy = 0.76;
    before.red_modules = ["tinydb", "tinydb.utils", "tinydb.queries"];
    const text = describeReportChange(before, r.report)!;
    expect(text).toContain("accuracy 76% to 89%");
    expect(text).toContain("no longer red: tinydb.queries");
    expect(describeReportChange(r.report, r.report)).toBeUndefined();
  });
});
