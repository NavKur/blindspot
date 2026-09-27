import type { BobAllowed, Finding, FindingType, ReadinessContext, Severity } from "../contract";
import { gateLabel, percent } from "../contract";
import type { ContextIndex } from "../contextIndex";
import { formatCoins, queueTotals } from "../queueLogic";

/** Everything the webview needs to render, as plain JSON. Built on the extension side. */
export interface PanelState {
  hasContext: boolean;
  header: HeaderState;
  tabs: {
    review: FindingRow[];
    testing: FindingRow[];
    modernize: FindingRow[];
  };
  footer: FooterState;
  release?: unknown;
  onboarding?: unknown;
  run?: unknown;
  activeTab: TabId;
}

export type TabId = "onboarding" | "review" | "testing" | "release" | "modernize";
export const TAB_IDS: TabId[] = ["onboarding", "review", "testing", "release", "modernize"];

export interface HeaderState {
  repoName: string;
  readiness: string;
  sureButWrong: number;
  sessionCoins: string;
  studyCoins: string;
}

export interface FindingRow {
  id: string;
  severity: Severity;
  title: string;
  functionName: string;
  file: string;
  fileLabel: string;
  line: number;
  detail: string;
  recommendation: string;
  gate: BobAllowed;
  gateLabel: string;
  readiness: number;
  selected: boolean;
  disabled: boolean;
  coins: number;
}

export interface FooterState {
  selected: number;
  coinsText: string;
  canSend: boolean;
}

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

/** Severity first (high, medium, low), then readiness of the function, lowest first, then id. */
export function sortFindings(findings: Finding[], index: ContextIndex): Finding[] {
  const readinessOf = (f: Finding) => index.functionById(f.function_id)?.readiness ?? 1;
  return [...findings].sort((a, b) => {
    const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (s !== 0) return s;
    const r = readinessOf(a) - readinessOf(b);
    if (r !== 0) return r;
    return a.id.localeCompare(b.id);
  });
}

export function findingsOfType(index: ContextIndex, type: FindingType): Finding[] {
  return sortFindings(index.context.findings.filter((f) => f.type === type), index);
}

export function toRow(finding: Finding, index: ContextIndex, selected: ReadonlySet<string>): FindingRow {
  const fn = index.functionById(finding.function_id);
  const disabled = finding.bob_allowed === "no";
  return {
    id: finding.id,
    severity: finding.severity,
    title: finding.title,
    functionName: fn?.name ?? finding.function_id.split("::").pop() ?? finding.function_id,
    file: finding.file,
    fileLabel: `${finding.file.split("/").pop() ?? finding.file}:${finding.line_start}`,
    line: finding.line_start,
    detail: finding.detail,
    recommendation: finding.recommendation,
    gate: finding.bob_allowed,
    gateLabel: gateLabel(finding.bob_allowed),
    readiness: fn?.readiness ?? 0,
    selected: !disabled && selected.has(finding.id),
    disabled,
    coins: finding.estimated_coins,
  };
}

export function buildHeader(ctx: ReadinessContext | undefined, sessionCoins: number): HeaderState {
  return {
    repoName: ctx?.repo.name ?? "no context",
    readiness: ctx ? percent(ctx.summary.readiness) : "--",
    sureButWrong: ctx?.summary.sure_but_wrong ?? 0,
    sessionCoins: sessionCoins.toFixed(1),
    studyCoins: ctx ? ctx.summary.bobcoins_spent.toFixed(1) : "--",
  };
}

export function buildFooter(ctx: ReadinessContext | undefined, selected: ReadonlySet<string>): FooterState {
  const chosen = ctx ? ctx.findings.filter((f) => selected.has(f.id) && f.bob_allowed !== "no") : [];
  const totals = queueTotals(chosen);
  return { selected: totals.count, coinsText: formatCoins(totals.coins), canSend: totals.count > 0 };
}

export function buildPanelState(
  index: ContextIndex | undefined,
  selected: ReadonlySet<string>,
  sessionCoins: number,
  activeTab: TabId,
): PanelState {
  const ctx = index?.context;
  const rows = (type: FindingType) => (index ? findingsOfType(index, type).map((f) => toRow(f, index, selected)) : []);
  return {
    hasContext: !!ctx,
    header: buildHeader(ctx, sessionCoins),
    tabs: { review: rows("review_risk"), testing: rows("test_gap"), modernize: rows("modernize") },
    footer: buildFooter(ctx, selected),
    activeTab,
  };
}
