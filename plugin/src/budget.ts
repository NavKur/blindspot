/** Session budget rule: a budget of 0 or less means no limit. */
export function withinBudget(spent: number, estimate: number, budget: number): boolean {
  if (budget <= 0) return true;
  return spent + estimate <= budget + 1e-9;
}

export function budgetMessage(spent: number, estimate: number, budget: number): string {
  return (
    `This would bring the session to about ${(spent + estimate).toFixed(1)} Bobcoins, over the budget of ${budget.toFixed(1)}. ` +
    `Spent so far: ${spent.toFixed(1)}. Raise bobReadiness.sessionBudget or select fewer findings.`
  );
}
