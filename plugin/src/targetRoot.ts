import * as fs from "node:fs/promises";
import * as path from "node:path";

/**
 * Where the examined repository lives. Report paths and readiness paths are relative to it.
 * Order: the bobReadiness.targetRoot setting, then target/<repo> from target.lock.json (the
 * Blindspot repository layout), then the workspace root itself (the plugin is installed in the
 * examined repository).
 */
export async function resolveTargetRoot(workspaceRoot: string, setting: string): Promise<string> {
  if (setting.trim()) return path.resolve(workspaceRoot, setting.trim());
  try {
    const lock = JSON.parse(await fs.readFile(path.join(workspaceRoot, "target.lock.json"), "utf8")) as { repo?: string };
    const name = (lock.repo ?? "").split("/").pop()?.replace(/\.git$/, "");
    if (name) {
      const candidate = path.join(workspaceRoot, "target", name);
      if (await exists(candidate)) return candidate;
    }
  } catch {
    // no lock file: the workspace is the examined repository
  }
  return workspaceRoot;
}

/** First existing path among the candidates, or the first candidate when none exists yet. */
export async function firstExisting(candidates: string[]): Promise<string> {
  for (const c of candidates) if (await exists(c)) return c;
  return candidates[0];
}

export async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
