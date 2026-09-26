import { describe, expect, it } from "vitest";
import { ContextIndex } from "../src/contextIndex";
import { branchName, buildBobPrompt, buildOnboardingPrompt, commitMessageFor, findingSummaryLine } from "../src/prompt";
import { loadFixture } from "./helpers";

describe("buildBobPrompt", () => {
  const index = new ContextIndex(loadFixture());
  const f1 = index.findingById("F001")!;
  const f7 = index.findingById("F007")!;

  it("lists FILE/LINE for every finding and includes notes for with_notes items", () => {
    const prompt = buildBobPrompt([f1, f7], index, "- Table.update(): with no condition it updates every document.");
    expect(prompt).toContain(`FILE: tinydb/table.py LINE: ${f1.line_start}`);
    expect(prompt).toContain(`FILE: tinydb/storages.py LINE: ${f7.line_start}`);
    expect(prompt).toContain("Study notes about this repository");
    expect(prompt).toContain("updates every document");
    expect(prompt).toContain("Keep public function names and parameters unchanged");
    expect(prompt).toContain("add or update tests");
    expect(prompt).toContain(f1.title);
    expect(prompt).toContain(f1.recommendation);
    expect(prompt).toContain("(with study notes)");
    expect(prompt).toContain('you previously believed "update() raises ValueError');
  });

  it("leaves the notes out when no item needs them", () => {
    const prompt = buildBobPrompt([f7], index, "NOTES");
    expect(prompt).not.toContain("NOTES");
    expect(prompt).toContain("Items to do (1)");
  });
});

describe("buildOnboardingPrompt", () => {
  it("is read-only and includes notes, architecture and the question", () => {
    const prompt = buildOnboardingPrompt("How do queries work?", loadFixture(), "notes here");
    expect(prompt).toContain("Do not edit any files");
    expect(prompt).toContain("under 150 words");
    expect(prompt).toContain("notes here");
    expect(prompt).toContain("tinydb/queries.py (55% not_ready) imports tinydb/utils.py");
    expect(prompt.trim().endsWith("How do queries work?")).toBe(true);
  });
});

describe("names", () => {
  it("builds the branch name", () => {
    expect(branchName(new Date(2026, 8, 27, 10, 15))).toBe("bob/readiness-20260927-1015");
    expect(branchName(new Date(2026, 0, 3, 9, 5))).toBe("bob/readiness-20260103-0905");
  });
  it("summarises findings and commit messages", () => {
    const index = new ContextIndex(loadFixture());
    expect(findingSummaryLine(index.findingById("F001")!)).toBe("F001 table.py: Bob was sure but wrong about update() (with study notes)");
    expect(findingSummaryLine(index.findingById("F007")!)).toBe("F007 storages.py: MemoryStorage.write() has no direct test");
    expect(commitMessageFor([index.findingById("F001")!, index.findingById("F004")!])).toBe("bob: readiness fixes for F001, F004");
  });
});
