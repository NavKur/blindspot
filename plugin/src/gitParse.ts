/** Pure parsers for git output. */
export interface FileStat {
  path: string;
  added: number;
  removed: number;
}

/** Parse `git diff --numstat` output. Binary files count as 0/0. */
export function parseNumstat(output: string): FileStat[] {
  const out: FileStat[] = [];
  for (const line of output.split("\n")) {
    const parts = line.trim().split("\t");
    if (parts.length < 3) continue;
    const [a, r, ...rest] = parts;
    let path = rest.join("\t");
    // renames look like "old => new" or "dir/{old => new}.py"
    const arrow = path.match(/\{?([^{}]*) => ([^{}]*)\}?/);
    if (arrow) path = path.replace(arrow[0], arrow[2]);
    out.push({ path, added: a === "-" ? 0 : Number(a), removed: r === "-" ? 0 : Number(r) });
  }
  return out;
}

export interface HunkRange {
  start: number;
  end: number;
}

/** New-side line ranges from `git diff -U0` output, grouped by file path. */
export function parseChangedRanges(diff: string): Map<string, HunkRange[]> {
  const result = new Map<string, HunkRange[]>();
  let current: string | undefined;
  for (const line of diff.split("\n")) {
    const file = line.match(/^\+\+\+ b\/(.+)$/);
    if (file) {
      current = file[1];
      if (!result.has(current)) result.set(current, []);
      continue;
    }
    if (line.startsWith("+++ /dev/null")) {
      current = undefined;
      continue;
    }
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (hunk && current) {
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      // A pure deletion has count 0: the change touches the line before it.
      const end = count === 0 ? start : start + count - 1;
      result.get(current)!.push({ start: Math.max(1, start), end: Math.max(1, end) });
    }
  }
  return result;
}

/** Lines of `git log --format=%s`, empty lines dropped. */
export function parseSubjects(output: string): string[] {
  return output
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}
