import type { Finding } from "./contract";

export interface QueueTotals {
  count: number;
  coins: number;
}

/** Count and cost of the selected findings. Rounded to one decimal for display elsewhere. */
export function queueTotals(findings: Finding[]): QueueTotals {
  const coins = findings.reduce((sum, f) => sum + f.estimated_coins, 0);
  return { count: findings.length, coins: Math.round(coins * 100) / 100 };
}

/** "about 1.9 Bobcoins" */
export function formatCoins(coins: number): string {
  return `about ${coins.toFixed(1)} Bobcoins`;
}

/** Can this finding be queued at all? Findings with bob_allowed "no" never can. */
export function canQueue(finding: Finding): boolean {
  return finding.bob_allowed !== "no";
}
