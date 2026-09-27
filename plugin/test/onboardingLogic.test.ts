import { describe, expect, it } from "vitest";
import { costLabel, lookupAnswer, normalizeQuestion, setupLines, SUGGESTED_QUESTIONS, withAnswer } from "../src/onboardingLogic";
import { loadFixture } from "./helpers";

describe("onboarding logic", () => {
  it("normalises questions so repeats hit the cache", () => {
    expect(normalizeQuestion("  How do   Queries work?? ")).toBe("how do queries work");
    expect(normalizeQuestion("How do queries work")).toBe("how do queries work");
  });

  it("stores and finds answers", () => {
    const cache = withAnswer({}, "How do queries work?", "Like this.", 0.8, new Date("2026-09-27T10:00:00Z"));
    expect(lookupAnswer(cache, "how do queries WORK")?.answer).toBe("Like this.");
    expect(lookupAnswer(cache, "other")).toBeUndefined();
    expect(cache["how do queries work"].askedAt).toBe("2026-09-27T10:00:00.000Z");
  });

  it("labels costs", () => {
    expect(costLabel(0.8, false)).toBe("Answered by Bob, 0.8 Bobcoins");
    expect(costLabel(0.8, true)).toBe("Answered before, free");
  });

  it("has three suggested questions and setup lines", () => {
    expect(SUGGESTED_QUESTIONS.length).toBe(3);
    expect(setupLines(loadFixture())).toEqual(["pip install -e .", "pytest -q"]);
  });
});
