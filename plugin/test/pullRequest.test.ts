import { describe, expect, it } from "vitest";
import { budgetMessage, withinBudget } from "../src/budget";
import { ContextIndex } from "../src/contextIndex";
import { pullRequestBody, pullRequestTitle } from "../src/pullRequest";
import { loadFixture } from "./helpers";

describe("pull request text", () => {
  const index = new ContextIndex(loadFixture());
  const findings = [index.findingById("F001")!, index.findingById("F007")!];

  it("builds a title and a reviewer friendly body", () => {
    expect(pullRequestTitle(findings)).toBe("Bob: readiness fixes for F001, F007");
    expect(pullRequestTitle([findings[1]])).toBe("Bob: MemoryStorage.write() has no direct test");
    const body = pullRequestBody({
      branch: "bob/readiness-20260927-1015",
      base: "main",
      findings,
      files: [{ path: "tinydb/table.py", added: 3, removed: 1 }],
      cost: 1.7,
      tests: { passed: true, summary: "217 passed in 5.8s" },
      bobSummary: "Done.",
      fake: true,
    });
    expect(body).toContain("| F001 | review risk | `tinydb/table.py:");
    expect(body).toContain("Bob with notes, review needed");
    expect(body).toContain("Review closely: F001");
    expect(body).toContain("- `tinydb/table.py` (+3 -1)");
    expect(body).toContain("Passed: 217 passed in 5.8s");
    expect(body).toContain("fake Bob");
  });
});

describe("budget", () => {
  it("applies the session budget", () => {
    expect(withinBudget(3, 1.9, 5)).toBe(true);
    expect(withinBudget(3.5, 1.9, 5)).toBe(false);
    expect(withinBudget(100, 50, 0)).toBe(true);
    expect(budgetMessage(3.5, 1.9, 5)).toContain("about 5.4 Bobcoins, over the budget of 5.0");
  });
});
