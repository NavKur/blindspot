import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import { describeProblems, gateLabel, parseContext, percent, validateContext } from "../src/contract";
import { fixtureCopy, fixturePath } from "./helpers";

describe("contract", () => {
  it("accepts the sample fixture", () => {
    const result = parseContext(fs.readFileSync(fixturePath, "utf8"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.context.repo.name).toBe("tinydb");
      expect(result.context.findings.length).toBeGreaterThan(0);
    }
  });

  it("rejects a missing required field", () => {
    const broken = fixtureCopy() as unknown as Record<string, unknown>;
    delete (broken.summary as Record<string, unknown>).readiness;
    const result = validateContext(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems[0].path).toBe("summary.readiness");
    }
  });

  it("rejects a bad enum value", () => {
    const broken = fixtureCopy();
    (broken.findings[0] as unknown as { bob_allowed: string }).bob_allowed = "maybe";
    const result = validateContext(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems.some((p) => p.path === "findings.0.bob_allowed")).toBe(true);
    }
  });

  it("rejects line_end before line_start", () => {
    const broken = fixtureCopy();
    broken.functions[0].line_start = 50;
    broken.functions[0].line_end = 10;
    const result = validateContext(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems.some((p) => p.path === "functions.0.line_end")).toBe(true);
    }
  });

  it("rejects invalid JSON without throwing", () => {
    const result = parseContext("{ not json");
    expect(result.ok).toBe(false);
  });

  it("describes only the first 3 problems", () => {
    const text = describeProblems(
      [1, 2, 3, 4, 5].map((n) => ({ path: `p${n}`, message: `m${n}` })),
    );
    expect(text).toContain("p1: m1");
    expect(text).toContain("p3: m3");
    expect(text).not.toContain("p4");
    expect(text).toContain("and 2 more");
  });

  it("formats labels", () => {
    expect(percent(0.734)).toBe("73%");
    expect(gateLabel("no")).toBe("Needs a person");
    expect(gateLabel("with_notes")).toBe("Bob with notes, review needed");
    expect(gateLabel("yes")).toBe("Bob can do this");
  });
});
