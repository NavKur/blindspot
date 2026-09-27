import type { ReadinessContext } from "./contract";

export interface CachedAnswer {
  answer: string;
  cost: number;
  askedAt: string;
}

export type AnswerCache = Record<string, CachedAnswer>;

export const SUGGESTED_QUESTIONS = [
  "Where does data actually get written to disk?",
  "How do queries work?",
  "What should I read first?",
];

export type OnboardingRole = "new" | "reviewing" | "releasing";

export const ROLE_LABELS: Record<OnboardingRole, string> = {
  new: "New to the repo",
  reviewing: "Reviewing a change",
  releasing: "About to release",
};

/** Three question sets, one per situation. Answers are cached by question text whatever the role. */
export const SUGGESTED_BY_ROLE: Record<OnboardingRole, string[]> = {
  new: SUGGESTED_QUESTIONS,
  reviewing: [
    "Which parts of this code does Bob understand least?",
    "What behaviour is easy to get wrong in Table.update()?",
    "Which tests cover the storage layer?",
  ],
  releasing: [
    "What changed recently in areas where Bob was wrong before?",
    "Which functions have no tests?",
    "What should the release notes mention?",
  ],
};

/** Cache key: case and whitespace insensitive, trailing punctuation ignored. */
export function normalizeQuestion(question: string): string {
  return question.trim().toLowerCase().replace(/\s+/g, " ").replace(/[?.!\s]+$/g, "");
}

export function lookupAnswer(cache: AnswerCache, question: string): CachedAnswer | undefined {
  return cache[normalizeQuestion(question)];
}

export function withAnswer(cache: AnswerCache, question: string, answer: string, cost: number, now = new Date()): AnswerCache {
  return { ...cache, [normalizeQuestion(question)]: { answer, cost, askedAt: now.toISOString() } };
}

/** "Answered by Bob, 0.8 Bobcoins" or "Answered before, free". */
export function costLabel(cost: number, fromCache: boolean): string {
  if (fromCache) return "Answered before, free";
  return `Answered by Bob, ${cost.toFixed(1)} Bobcoins`;
}

/** Setup lines shown in the code block: install commands then the test command. */
export function setupLines(ctx: ReadinessContext): string[] {
  return [...ctx.setup.install, ctx.setup.test].filter((l) => l.trim());
}
