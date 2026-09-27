import { describe, expect, it } from "vitest";
import * as path from "node:path";
import { findEngineRoot, pickResultsDir, publishCommandFor, reportWatchGlobs } from "../src/report/resultsLocation";

const existsIn = (files: string[]) => async (p: string) => files.includes(p);

describe("pickResultsDir", () => {
  const root = path.resolve("/repo");

  it("prefers the engine results folder", async () => {
    const exists = existsIn([path.join(root, "results", "report_latest.json"), path.join(root, "results", "sim", "report_latest.json")]);
    expect(await pickResultsDir(root, "results", exists)).toEqual({ dir: path.join(root, "results"), source: "results" });
  });

  it("falls back to results/sim and labels it", async () => {
    const exists = existsIn([path.join(root, "results", "sim", "report_latest.json")]);
    expect(await pickResultsDir(root, "results", exists)).toEqual({ dir: path.join(root, "results", "sim"), source: "sim" });
  });

  it("falls back to the published copies in .bob/blindspot", async () => {
    const exists = existsIn([path.join(root, ".bob", "blindspot", "report_latest.json")]);
    expect(await pickResultsDir(root, "results", exists)).toEqual({ dir: path.join(root, ".bob", "blindspot"), source: "published" });
  });

  it("honours a custom results path and returns undefined when nothing exists", async () => {
    const exists = existsIn([path.join(root, "out", "report_latest.json")]);
    expect(await pickResultsDir(root, "out/", exists)).toEqual({ dir: path.join(root, "out"), source: "results" });
    expect(await pickResultsDir(root, "results", existsIn([]))).toBeUndefined();
  });

  it("watches all three places", () => {
    expect(reportWatchGlobs("results/")).toEqual([
      "results/report_latest.json",
      "results/history.jsonl",
      "results/sim/report_latest.json",
      "results/sim/history.jsonl",
      ".bob/blindspot/report_latest.json",
      ".bob/blindspot/history.jsonl",
    ]);
  });
});

describe("findEngineRoot", () => {
  const engine = path.resolve("/work/blindspot");
  const exists = existsIn([path.join(engine, "cli.py"), path.join(engine, "blindspot", "publish.py"), path.join(engine, "target", "tinydb", "cli.py")]);

  it("finds the engine when it is the workspace", async () => {
    expect(await findEngineRoot(engine, exists)).toBe(engine);
  });

  it("walks up from the examined repository inside target/", async () => {
    expect(await findEngineRoot(path.join(engine, "target", "tinydb"), exists)).toBe(engine);
  });

  it("needs both cli.py and the publish module", async () => {
    // target/tinydb has a stray cli.py but no blindspot/publish.py, so the parent wins.
    expect(await findEngineRoot(path.join(engine, "target", "tinydb"), exists)).toBe(engine);
    expect(await findEngineRoot(path.resolve("/elsewhere/repo"), exists)).toBeUndefined();
  });

  it("stops after maxLevels", async () => {
    expect(await findEngineRoot(path.join(engine, "a", "b", "c", "d", "e"), exists, 2)).toBeUndefined();
    expect(await findEngineRoot(path.join(engine, "a", "b"), exists, 2)).toBe(engine);
  });
});

describe("publishCommandFor", () => {
  const engine = path.resolve("/work/blindspot");
  const tinydb = path.join(engine, "target", "tinydb");
  const venv = path.join(engine, ".venv", "bin", "python");

  it("uses the engine virtualenv for a bare python and names the destination", () => {
    expect(publishCommandFor("python cli.py publish", engine, tinydb, venv)).toBe(`"${venv}" cli.py publish --dest "${tinydb}"`);
    expect(publishCommandFor("python3 cli.py publish --run test_C1_r1", engine, tinydb, undefined)).toBe(
      `python3 cli.py publish --run test_C1_r1 --dest "${tinydb}"`,
    );
  });

  it("leaves custom interpreters and existing destinations alone", () => {
    expect(publishCommandFor("/usr/bin/python cli.py publish", engine, tinydb, venv)).toBe(`/usr/bin/python cli.py publish --dest "${tinydb}"`);
    expect(publishCommandFor("python cli.py publish --dest /tmp/x", engine, tinydb, venv)).toBe(`"${venv}" cli.py publish --dest /tmp/x`);
    expect(publishCommandFor("python cli.py publish --dest=/tmp/x", engine, tinydb, undefined)).toBe("python cli.py publish --dest=/tmp/x");
  });

  it("never publishes into the engine root itself", () => {
    expect(publishCommandFor("python cli.py publish", engine, engine, undefined)).toBe("python cli.py publish");
    expect(publishCommandFor("python cli.py publish", engine, undefined, undefined)).toBe("python cli.py publish");
  });
});
