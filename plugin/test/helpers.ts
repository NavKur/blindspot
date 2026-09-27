import * as fs from "node:fs";
import * as path from "node:path";
import type { ReadinessContext } from "../src/contract";

export const fixturePath = path.resolve(__dirname, "../fixtures/readiness.sample.json");

export function loadFixture(): ReadinessContext {
  return JSON.parse(fs.readFileSync(fixturePath, "utf8")) as ReadinessContext;
}

/** Deep copy so tests can break the fixture without touching each other. */
export function fixtureCopy(): ReadinessContext {
  return JSON.parse(JSON.stringify(loadFixture())) as ReadinessContext;
}
