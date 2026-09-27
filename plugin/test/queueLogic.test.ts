import { describe, expect, it } from "vitest";
import { lensesForFunction } from "../src/codelensText";
import { ContextIndex } from "../src/contextIndex";
import { canQueue, formatCoins, queueTotals } from "../src/queueLogic";
import { loadFixture } from "./helpers";

describe("queue logic", () => {
  const index = new ContextIndex(loadFixture());

  it("totals count and coins", () => {
    const totals = queueTotals([index.findingById("F001")!, index.findingById("F004")!]);
    expect(totals).toEqual({ count: 2, coins: 1.9 });
    expect(formatCoins(totals.coins)).toBe("about 1.9 Bobcoins");
    expect(queueTotals([])).toEqual({ count: 0, coins: 0 });
  });

  it("never allows bob_allowed no", () => {
    expect(canQueue(index.findingById("F003")!)).toBe(false);
    expect(canQueue(index.findingById("F001")!)).toBe(true);
  });

  it("builds CodeLens text", () => {
    const update = index.functionById("tinydb/table.py::Table.update")!;
    const lenses = lensesForFunction(update, index.findingsForFunction(update.id));
    expect(lenses.map((l) => l.title)).toEqual(["Add to Bob queue (1)", "Why Bob is unsure"]);
    const search = index.functionById("tinydb/queries.py::Query.search")!;
    const blocked = lensesForFunction(search, index.findingsForFunction(search.id));
    expect(blocked[0].title).toBe("Needs a person");
    expect(lensesForFunction(update, [])).toEqual([]);
  });
});
