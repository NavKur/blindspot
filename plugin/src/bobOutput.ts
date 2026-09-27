/** Pure parsing of headless Bob's stdout. Shape documented in docs/gonogo.md. */
export interface BobResult {
  status: string | undefined;
  message: string;
  cost: number;
  raw: Record<string, unknown> | undefined;
}

export function parseBobOutput(stdout: string): BobResult {
  const obj = findResultObject(stdout);
  if (!obj) {
    return { status: undefined, message: stdout.trim().split("\n").slice(-5).join("\n"), cost: 0, raw: undefined };
  }
  return {
    status: typeof obj.status === "string" ? obj.status : undefined,
    message: pickMessage(obj),
    cost: pickCost(obj),
    raw: obj,
  };
}

function findResultObject(stdout: string): Record<string, unknown> | undefined {
  const whole = tryParse(stdout.trim());
  if (whole) return whole;
  const lines = stdout.trim().split("\n").reverse();
  let fallback: Record<string, unknown> | undefined;
  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    const obj = tryParse(t);
    if (!obj) continue;
    if (obj.type === "result") return obj;
    fallback ??= obj;
  }
  return fallback;
}

function tryParse(text: string): Record<string, unknown> | undefined {
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function pickMessage(obj: Record<string, unknown>): string {
  for (const key of ["last_message", "message", "result", "output", "text"]) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
}

/** Cost in Bobcoins: stats.session_costs first, then a few common alternatives. */
export function pickCost(obj: Record<string, unknown>): number {
  const stats = obj.stats;
  if (stats && typeof stats === "object") {
    const s = stats as Record<string, unknown>;
    for (const key of ["session_costs", "cost", "total_cost"]) {
      if (typeof s[key] === "number") return s[key] as number;
    }
  }
  for (const key of ["cost", "total_cost", "session_costs"]) {
    if (typeof obj[key] === "number") return obj[key] as number;
  }
  return 0;
}

/** Split a command line into argv, honouring single and double quotes. */
export function splitCommand(command: string): string[] {
  const out: string[] = [];
  let current = "";
  let quote: string | undefined;
  let has = false;
  for (const ch of command) {
    if (quote) {
      if (ch === quote) quote = undefined;
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      has = true;
    } else if (/\s/.test(ch)) {
      if (has || current) out.push(current);
      current = "";
      has = false;
    } else {
      current += ch;
    }
  }
  if (has || current) out.push(current);
  return out;
}

/** Last N lines of text, for compact test output. */
export function tail(text: string, lines: number): string {
  const all = text.trimEnd().split("\n");
  return all.slice(-lines).join("\n");
}
