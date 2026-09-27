import { z } from "zod";

// Section 2 of BUILD_PLAN.md is the contract. Field names are fixed: never add or rename them.

export const fileStatusValues = ["ready", "review", "not_ready"] as const;
export const functionStatusValues = ["ok", "part", "wrong"] as const;
export const findingTypeValues = ["review_risk", "test_gap", "modernize", "release_risk"] as const;
export const severityValues = ["high", "medium", "low"] as const;
export const bobAllowedValues = ["yes", "with_notes", "no"] as const;

const lineRange = {
  line_start: z.number().int().min(1),
  line_end: z.number().int().min(1),
};

const lineOrderCheck = (v: { line_start: number; line_end: number }, ctx: z.RefinementCtx) => {
  if (v.line_end < v.line_start) {
    ctx.addIssue({
      code: "custom",
      path: ["line_end"],
      message: "line_end must not be before line_start",
    });
  }
};

export const RepoSchema = z.object({
  name: z.string(),
  commit: z.string(),
  generated_at: z.string(),
});

export const SummarySchema = z.object({
  readiness: z.number().min(0).max(1),
  questions: z.number().int().min(0),
  sure_but_wrong: z.number().int().min(0),
  bobcoins_spent: z.number().min(0),
});

export const SetupSchema = z.object({
  install: z.array(z.string()),
  test: z.string(),
});

export const FileEntrySchema = z.object({
  path: z.string(),
  readiness: z.number().min(0).max(1),
  status: z.enum(fileStatusValues),
  imports: z.array(z.string()),
});

export const MisconceptionSchema = z.object({
  believed: z.string(),
  truth: z.string(),
  confidence: z.number().min(0).max(1),
});

export const FunctionEntrySchema = z
  .object({
    id: z.string(),
    file: z.string(),
    name: z.string(),
    ...lineRange,
    readiness: z.number().min(0).max(1),
    status: z.enum(functionStatusValues),
    tested: z.boolean(),
    misconceptions: z.array(MisconceptionSchema),
  })
  .superRefine(lineOrderCheck);

export const FindingSchema = z
  .object({
    id: z.string(),
    type: z.enum(findingTypeValues),
    severity: z.enum(severityValues),
    file: z.string(),
    ...lineRange,
    function_id: z.string(),
    title: z.string(),
    detail: z.string(),
    recommendation: z.string(),
    bob_allowed: z.enum(bobAllowedValues),
    estimated_coins: z.number().min(0),
  })
  .superRefine(lineOrderCheck);

export const StarterTaskSchema = z.object({
  title: z.string(),
  file: z.string(),
  why: z.string(),
});

export const ReadinessContextSchema = z.object({
  version: z.literal(1),
  repo: RepoSchema,
  summary: SummarySchema,
  setup: SetupSchema,
  notes_markdown_path: z.string(),
  files: z.array(FileEntrySchema),
  functions: z.array(FunctionEntrySchema),
  findings: z.array(FindingSchema),
  starter_tasks: z.array(StarterTaskSchema),
});

export type FileStatus = (typeof fileStatusValues)[number];
export type FunctionStatus = (typeof functionStatusValues)[number];
export type FindingType = (typeof findingTypeValues)[number];
export type Severity = (typeof severityValues)[number];
export type BobAllowed = (typeof bobAllowedValues)[number];

export type Repo = z.infer<typeof RepoSchema>;
export type Summary = z.infer<typeof SummarySchema>;
export type Setup = z.infer<typeof SetupSchema>;
export type FileEntry = z.infer<typeof FileEntrySchema>;
export type Misconception = z.infer<typeof MisconceptionSchema>;
export type FunctionEntry = z.infer<typeof FunctionEntrySchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type StarterTask = z.infer<typeof StarterTaskSchema>;
export type ReadinessContext = z.infer<typeof ReadinessContextSchema>;

export interface ValidationProblem {
  path: string;
  message: string;
}

export type ParseResult =
  | { ok: true; context: ReadinessContext }
  | { ok: false; problems: ValidationProblem[] };

/** Parse and validate raw JSON text. Never throws. */
export function parseContext(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    return { ok: false, problems: [{ path: "", message: `Not valid JSON: ${(err as Error).message}` }] };
  }
  return validateContext(data);
}

/** Validate an already parsed object. Never throws. */
export function validateContext(data: unknown): ParseResult {
  const result = ReadinessContextSchema.safeParse(data);
  if (result.success) {
    return { ok: true, context: result.data };
  }
  const problems = result.error.issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
  return { ok: false, problems };
}

/** Human readable description of the first few problems, for one error message. */
export function describeProblems(problems: ValidationProblem[], max = 3): string {
  const shown = problems.slice(0, max).map((p) => (p.path ? `${p.path}: ${p.message}` : p.message));
  const more = problems.length > max ? ` (and ${problems.length - max} more)` : "";
  return shown.join("; ") + more;
}

/** Percentage string such as "73%". */
export function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** Plain English label for a readiness gate. */
export function gateLabel(allowed: BobAllowed): string {
  switch (allowed) {
    case "yes":
      return "Bob can do this";
    case "with_notes":
      return "Bob with notes, review needed";
    case "no":
      return "Needs a person";
  }
}

/** Plain English label for a function status. */
export function statusLabel(status: FunctionStatus): string {
  switch (status) {
    case "ok":
      return "Bob knows this";
    case "part":
      return "Partly known";
    case "wrong":
      return "Sure but wrong";
  }
}

/** Plain English label for a finding type. */
export function findingTypeLabel(type: FindingType): string {
  switch (type) {
    case "review_risk":
      return "review risk";
    case "test_gap":
      return "test gap";
    case "modernize":
      return "modernize";
    case "release_risk":
      return "release risk";
  }
}
