import type { Finding, FunctionEntry, ReadinessContext } from "./contract";

/** Pure lookups over a validated context. No vscode dependency, so it is easy to unit test. */
export class ContextIndex {
  private readonly functionsByFile = new Map<string, FunctionEntry[]>();
  private readonly findingsByFile = new Map<string, Finding[]>();
  private readonly functionsById = new Map<string, FunctionEntry>();
  private readonly findingsById = new Map<string, Finding>();
  private readonly findingsByFunction = new Map<string, Finding[]>();

  constructor(public readonly context: ReadinessContext) {
    for (const fn of context.functions) {
      this.functionsById.set(fn.id, fn);
      push(this.functionsByFile, normalizePath(fn.file), fn);
    }
    for (const finding of context.findings) {
      this.findingsById.set(finding.id, finding);
      push(this.findingsByFile, normalizePath(finding.file), finding);
      push(this.findingsByFunction, finding.function_id, finding);
    }
  }

  functionsForFile(relPath: string): FunctionEntry[] {
    return this.functionsByFile.get(normalizePath(relPath)) ?? [];
  }

  findingsForFile(relPath: string): Finding[] {
    return this.findingsByFile.get(normalizePath(relPath)) ?? [];
  }

  functionById(id: string): FunctionEntry | undefined {
    return this.functionsById.get(id);
  }

  findingById(id: string): Finding | undefined {
    return this.findingsById.get(id);
  }

  findingsForFunction(functionId: string): Finding[] {
    return this.findingsByFunction.get(functionId) ?? [];
  }

  /** Functions in a file whose range covers a 1-based line. */
  functionsAtLine(relPath: string, line: number): FunctionEntry[] {
    return this.functionsForFile(relPath).filter((f) => f.line_start <= line && line <= f.line_end);
  }

  /** Findings in a file whose range covers a 1-based line. */
  findingsAtLine(relPath: string, line: number): Finding[] {
    return this.findingsForFile(relPath).filter((f) => f.line_start <= line && line <= f.line_end);
  }

  /** Every file path mentioned by files, functions or findings. */
  knownFiles(): string[] {
    const set = new Set<string>();
    for (const f of this.context.files) set.add(normalizePath(f.path));
    for (const k of this.functionsByFile.keys()) set.add(k);
    for (const k of this.findingsByFile.keys()) set.add(k);
    return [...set].sort();
  }
}

/** Forward slashes, no leading "./". */
export function normalizePath(p: string): string {
  let out = p.replace(/\\/g, "/");
  while (out.startsWith("./")) out = out.slice(2);
  return out;
}

/** Workspace relative path with forward slashes, or undefined when outside the root. */
export function relativeTo(root: string, absolute: string): string | undefined {
  const r = normalizePath(root).replace(/\/+$/, "");
  const a = normalizePath(absolute);
  const prefix = r + "/";
  if (!a.startsWith(prefix)) return undefined;
  return a.slice(prefix.length);
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
