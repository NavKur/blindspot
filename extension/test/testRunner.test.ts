import { describe, expect, it } from "vitest";
import { summarizeTestOutput } from "../src/testRunner";

describe("summarizeTestOutput", () => {
  it("finds the pytest summary line", () => {
    expect(summarizeTestOutput("....\n===== 217 passed in 5.8s =====\n", 0)).toBe("217 passed in 5.8s");
    expect(summarizeTestOutput("F..\n== 1 failed, 2 passed in 0.3s ==", 1)).toBe("1 failed, 2 passed in 0.3s");
  });
  it("falls back to the last line or the exit code", () => {
    expect(summarizeTestOutput("boom", 2)).toBe("boom");
    expect(summarizeTestOutput("", 0)).toBe("passed");
    expect(summarizeTestOutput("", 3)).toBe("exit code 3");
  });
});
