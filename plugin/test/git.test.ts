import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Git } from "../src/git";

// Integration test against real git and the fake Bob script, in a throwaway repository.
const root = fs.mkdtempSync(path.join(os.tmpdir(), "bob-readiness-git-"));
const fakeBob = path.resolve(__dirname, "../scripts/fake-bob.js");
const git = new Git(root);
const run = (args: string[]) =>
  execFileSync("git", args, { cwd: root, env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } }).toString();

beforeAll(() => {
  run(["init", "-q", "-b", "main"]);
  run(["config", "user.email", "t@t"]);
  run(["config", "user.name", "t"]);
  fs.mkdirSync(path.join(root, "pkg"));
  fs.writeFileSync(path.join(root, "pkg", "mod.py"), "def a():\n    return 1\n\ndef b():\n    return 2\n");
  run(["add", "-A"]);
  run(["commit", "-q", "-m", "feat: initial"]);
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("Git", () => {
  it("reports a clean tree and the current branch", async () => {
    expect(await git.isRepo()).toBe(true);
    expect(await git.isClean()).toBe(true);
    expect(await git.currentBranch()).toBe("main");
    expect(await git.lastTag()).toBeUndefined();
    expect((await git.releaseBase()).label).toMatch(/^first commit [0-9a-f]{7}$/);
  });

  it("creates a branch, lets fake Bob edit, shows diff stats, and discards back to base", async () => {
    await git.createBranch("bob/readiness-test");
    expect(await git.currentBranch()).toBe("bob/readiness-test");
    execFileSync(process.execPath, [fakeBob, "FILE: pkg/mod.py LINE: 4"], { cwd: root });
    fs.writeFileSync(path.join(root, "pkg", "new.py"), "x = 1\ny = 2\n");
    expect(await git.isClean()).toBe(false);
    const stats = await git.diffStat();
    expect(stats).toEqual(
      expect.arrayContaining([
        { path: "pkg/mod.py", added: 1, removed: 0 },
        { path: "pkg/new.py", added: 2, removed: 0 },
      ]),
    );
    expect(fs.readFileSync(path.join(root, "pkg", "mod.py"), "utf8")).toContain("# fake-bob: reviewed");

    await git.discardAndReturn("main");
    expect(await git.currentBranch()).toBe("main");
    expect(await git.isClean()).toBe(true);
    expect(await git.branchExists("bob/readiness-test")).toBe(false);
    expect(fs.existsSync(path.join(root, "pkg", "new.py"))).toBe(false);
  });

  it("commits everything on the branch when keeping", async () => {
    await git.createBranch("bob/readiness-keep");
    fs.appendFileSync(path.join(root, "pkg", "mod.py"), "\ndef c():\n    return 3\n");
    await git.commitAll("bob: readiness fixes for F001");
    expect(await git.isClean()).toBe(true);
    expect(await git.logSince("main")).toEqual(["bob: readiness fixes for F001"]);
    expect(await git.changedFilesSince("main")).toEqual(["pkg/mod.py"]);
    const ranges = await git.changedRangesSince("main");
    expect(ranges.get("pkg/mod.py")?.[0].start).toBeGreaterThan(5);
    run(["checkout", "-q", "main"]);
  });

  it("uses the last tag as the release base", async () => {
    run(["tag", "v0.1.0"]);
    fs.appendFileSync(path.join(root, "pkg", "mod.py"), "# tail\n");
    run(["commit", "-q", "-am", "fix: tail comment"]);
    expect(await git.lastTag()).toBe("v0.1.0");
    expect(await git.logSinceLastTag()).toEqual(["fix: tail comment"]);
  });
});
