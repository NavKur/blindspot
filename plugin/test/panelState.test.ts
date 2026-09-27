import { describe, expect, it } from "vitest";
import { ContextIndex } from "../src/contextIndex";
import { buildFooter, buildPanelState, findingsOfType, sortFindings, toRow } from "../src/panel/state";
import { loadFixture } from "./helpers";

describe("panel state", () => {
  const index = new ContextIndex(loadFixture());

  it("sorts by severity then readiness (lowest first) then id", () => {
    const review = findingsOfType(index, "review_risk").map((f) => f.id);
    // F001 (high, update 0.25) and F002 (high, write 0.25) tie on readiness, then id; F003 is medium.
    expect(review).toEqual(["F001", "F002", "F003"]);
    const testing = findingsOfType(index, "test_gap").map((f) => f.id);
    // high: F006 (fragment 0.25), F004 (upsert 0.5), F005 (close 0.5); low: F007
    expect(testing).toEqual(["F006", "F004", "F005", "F007"]);
    const modern = findingsOfType(index, "modernize").map((f) => f.id);
    expect(modern).toEqual(["F009", "F010", "F008"]);
  });

  it("is stable for an empty list", () => {
    expect(sortFindings([], index)).toEqual([]);
  });

  it("builds rows with gate labels and disabled state", () => {
    const row = toRow(index.findingById("F003")!, index, new Set(["F003"]));
    expect(row.disabled).toBe(true);
    expect(row.selected).toBe(false);
    expect(row.gateLabel).toBe("Needs a person");
    const ok = toRow(index.findingById("F007")!, index, new Set(["F007"]));
    expect(ok.selected).toBe(true);
    expect(ok.fileLabel).toMatch(/^storages\.py:\d+$/);
    expect(ok.functionName).toBe("MemoryStorage.write");
  });

  it("totals the footer across tabs and ignores blocked ids", () => {
    const footer = buildFooter(index.context, new Set(["F001", "F004", "F003"]));
    expect(footer.selected).toBe(2);
    expect(footer.coinsText).toBe("about 1.9 Bobcoins");
    expect(footer.canSend).toBe(true);
    expect(buildFooter(index.context, new Set()).canSend).toBe(false);
  });

  it("builds a full state and an empty one", () => {
    const state = buildPanelState(index, new Set(["F001"]), 1.25, "review");
    expect(state.header.repoName).toBe("tinydb");
    expect(state.header.readiness).toBe("73%");
    expect(state.header.sessionCoins).toBe("1.3");
    expect(state.header.sureButWrong).toBe("7");
    const fallback = buildPanelState(undefined, new Set(), 0, "exam", {
      repoName: "tinydb", readiness: "89%", readinessLabel: "accuracy, C2", sureButWrong: "9", sureButWrongLabel: "confidently wrong",
    });
    expect(fallback.header.repoName).toBe("tinydb");
    expect(fallback.header.readinessLabel).toBe("accuracy, C2");
    expect(state.tabs.review.length).toBe(3);
    const empty = buildPanelState(undefined, new Set(), 0, "onboarding");
    expect(empty.hasContext).toBe(false);
    expect(empty.tabs.review).toEqual([]);
  });
});
