import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parseChangedRanges, parseNumstat, parseSubjects, type FileStat, type HunkRange } from "./gitParse";

export class GitError extends Error {
  constructor(message: string, readonly command: string) {
    super(message);
  }
}

/** Thin git wrapper. Every call runs `git` with cwd = workspace root. */
export class Git {
  constructor(readonly cwd: string) {}

  async run(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile("git", args, { cwd: this.cwd, maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) reject(new GitError((stderr || err.message).trim(), `git ${args.join(" ")}`));
        else resolve(stdout);
      });
    });
  }

  async isRepo(): Promise<boolean> {
    try {
      return (await this.run(["rev-parse", "--is-inside-work-tree"])).trim() === "true";
    } catch {
      return false;
    }
  }

  /** True when there are no staged, unstaged or untracked (non-ignored) changes. */
  async isClean(): Promise<boolean> {
    return (await this.run(["status", "--porcelain"])).trim() === "";
  }

  async currentBranch(): Promise<string> {
    return (await this.run(["rev-parse", "--abbrev-ref", "HEAD"])).trim();
  }

  async createBranch(name: string): Promise<void> {
    await this.run(["checkout", "-b", name]);
  }

  async branchExists(name: string): Promise<boolean> {
    try {
      await this.run(["rev-parse", "--verify", "--quiet", `refs/heads/${name}`]);
      return true;
    } catch {
      return false;
    }
  }

  /** Working tree changes against HEAD, including untracked files (counted as all added). */
  async diffStat(): Promise<FileStat[]> {
    const tracked = parseNumstat(await this.run(["diff", "--numstat", "HEAD"]));
    const untracked = parseSubjects(await this.run(["ls-files", "--others", "--exclude-standard"]));
    for (const rel of untracked) {
      let added = 0;
      try {
        const text = await fs.readFile(path.join(this.cwd, rel), "utf8");
        added = text.split("\n").filter((l) => l.length > 0).length;
      } catch {
        // unreadable or binary: leave 0
      }
      tracked.push({ path: rel, added, removed: 0 });
    }
    return tracked;
  }

  async changedFiles(): Promise<string[]> {
    return (await this.diffStat()).map((f) => f.path);
  }

  async commitAll(message: string): Promise<void> {
    await this.run(["add", "-A"]);
    await this.run(["commit", "-m", message]);
  }

  /** Throw away every change, return to `base` and delete the branch we were on. */
  async discardAndReturn(base: string): Promise<void> {
    const branch = await this.currentBranch();
    await this.run(["reset", "--hard"]);
    await this.run(["clean", "-fd"]);
    await this.run(["checkout", base]);
    if (branch !== base && branch !== "HEAD") await this.run(["branch", "-D", branch]);
  }

  async lastTag(): Promise<string | undefined> {
    try {
      const tag = (await this.run(["describe", "--tags", "--abbrev=0"])).trim();
      return tag || undefined;
    } catch {
      return undefined;
    }
  }

  async firstCommit(): Promise<string> {
    const out = await this.run(["rev-list", "--max-parents=0", "HEAD"]);
    return parseSubjects(out).pop() ?? "HEAD";
  }

  /** Base ref for release comparisons: last tag, or the first commit when there is no tag. */
  async releaseBase(): Promise<{ ref: string; label: string }> {
    const tag = await this.lastTag();
    if (tag) return { ref: tag, label: tag };
    const first = await this.firstCommit();
    return { ref: first, label: `first commit ${first.slice(0, 7)}` };
  }

  async logSinceLastTag(): Promise<string[]> {
    const base = await this.releaseBase();
    return this.logSince(base.ref);
  }

  async logSince(ref: string): Promise<string[]> {
    return parseSubjects(await this.run(["log", "--format=%s", `${ref}..HEAD`]));
  }

  async changedFilesSince(ref: string): Promise<string[]> {
    return parseSubjects(await this.run(["diff", "--name-only", `${ref}..HEAD`]));
  }

  async changedRangesSince(ref: string): Promise<Map<string, HunkRange[]>> {
    return parseChangedRanges(await this.run(["diff", "-U0", `${ref}..HEAD`]));
  }

  async headShort(): Promise<string> {
    return (await this.run(["rev-parse", "--short", "HEAD"])).trim();
  }
}
