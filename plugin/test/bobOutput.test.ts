import { describe, expect, it } from "vitest";
import { parseBobOutput, pickCost, splitCommand, tail } from "../src/bobOutput";

const recorded =
  'some log line that is not JSON\n{"type": "result", "status": "success", "last_message": "{\\"ok\\": true}", "stats": {"task_id": "t1", "total_tokens": 100, "session_costs": 0.009604, "tool_calls": 0}}\n';

describe("parseBobOutput", () => {
  it("parses the recorded go/no-go shape with log lines before it", () => {
    const r = parseBobOutput(recorded);
    expect(r.status).toBe("success");
    expect(r.cost).toBeCloseTo(0.009604);
    expect(r.message).toBe('{"ok": true}');
  });

  it("parses fake Bob output and a top-level cost", () => {
    const r = parseBobOutput('[fake-bob] editing\n{"type":"result","status":"success","last_message":"Done.","stats":{"session_costs":0.0},"cost":0.0}');
    expect(r.cost).toBe(0);
    expect(r.message).toBe("Done.");
    expect(pickCost({ cost: 1.5 })).toBe(1.5);
    expect(pickCost({})).toBe(0);
  });

  it("falls back to the last lines when there is no JSON", () => {
    const r = parseBobOutput("error: something\nmore text");
    expect(r.status).toBeUndefined();
    expect(r.message).toContain("more text");
    expect(r.cost).toBe(0);
  });
});

describe("splitCommand", () => {
  it("splits on spaces and honours quotes", () => {
    expect(splitCommand("bob run --format json")).toEqual(["bob", "run", "--format", "json"]);
    expect(splitCommand('bob run --workspace "my dir" -m \'x y\'')).toEqual(["bob", "run", "--workspace", "my dir", "-m", "x y"]);
    expect(splitCommand("  ")).toEqual([]);
  });
});

describe("tail", () => {
  it("returns the last lines", () => {
    expect(tail("a\nb\nc\n", 2)).toBe("b\nc");
  });
});
