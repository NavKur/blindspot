import { z } from "zod";

// docs/REPORT_SCHEMA.md (schema_version 1). The plugin only reads these files.

export const MetricsSchema = z.looseObject({
  k: z.number(),
  n: z.number(),
  accuracy: z.number(),
  ci_low: z.number(),
  ci_high: z.number(),
  brier: z.number(),
  ece: z.number(),
  cw_rate: z.number(),
  cw_count: z.number(),
  mean_p: z.number(),
  overconfidence: z.number(),
});

export const NodeMetricsSchema = MetricsSchema.extend({
  low_n: z.boolean(),
  heat: z.number(),
});

export const ReliabilityBinSchema = z.looseObject({
  bin: z.number(),
  lo: z.number(),
  hi: z.number(),
  n: z.number(),
  mean_p: z.number().nullable(),
  accuracy: z.number().nullable(),
  ci_low: z.number().nullable(),
  ci_high: z.number().nullable(),
});

export const ModuleEntrySchema = NodeMetricsSchema.extend({
  module: z.string(),
  path: z.string(),
  red: z.boolean(),
  red_reasons: z.array(z.string()),
  by_family: z.record(z.string(), z.number()),
});

export const DirectoryEntrySchema = NodeMetricsSchema.extend({
  path: z.string(),
});

export const WorstEntitySchema = z.looseObject({
  entity: z.string(),
  module: z.string(),
  path: z.string(),
  n: z.number(),
  accuracy: z.number(),
  cw_count: z.number(),
});

export const RunSchema = z.looseObject({
  set: z.string(),
  condition: z.string(),
  repeat: z.number(),
  name: z.string(),
});

export const ReportSchema = z.looseObject({
  schema_version: z.literal(1),
  simulated: z.boolean().default(false),
  generated_at: z.string(),
  target_commit: z.string().nullable().optional(),
  run: RunSchema,
  counts: z.looseObject({ answers: z.number(), scored: z.number(), excluded: z.number() }),
  thresholds: z.looseObject({ confident_p: z.number(), red_acc_lower: z.number(), red_cw_rate: z.number() }),
  overall: MetricsSchema.extend({ reliability: z.array(ReliabilityBinSchema) }),
  modules: z.array(ModuleEntrySchema),
  directories: z.array(DirectoryEntrySchema),
  red_modules: z.array(z.string()),
  targeted_modules: z.array(z.string()).optional(),
  worst_entities: z.array(WorstEntitySchema),
});

export const HistoryLineSchema = z.looseObject({
  generated_at: z.string(),
  simulated: z.boolean().default(false),
  target_commit: z.string().nullable().optional(),
  run: z.string(),
  set: z.string(),
  condition: z.string(),
  repeat: z.number(),
  accuracy: z.number(),
  brier: z.number(),
  cw_rate: z.number(),
  n: z.number(),
  modules: z.record(
    z.string(),
    z.looseObject({ accuracy: z.number(), cw_rate: z.number(), heat: z.number(), red: z.boolean() }),
  ),
});

export type Metrics = z.infer<typeof MetricsSchema>;
export type NodeMetrics = z.infer<typeof NodeMetricsSchema>;
export type ReliabilityBin = z.infer<typeof ReliabilityBinSchema>;
export type ModuleEntry = z.infer<typeof ModuleEntrySchema>;
export type DirectoryEntry = z.infer<typeof DirectoryEntrySchema>;
export type WorstEntity = z.infer<typeof WorstEntitySchema>;
export type Report = z.infer<typeof ReportSchema>;
export type HistoryLine = z.infer<typeof HistoryLineSchema>;

export interface ReportProblem {
  path: string;
  message: string;
}

export type ReportParse = { ok: true; report: Report } | { ok: false; problems: ReportProblem[] };

export function parseReport(text: string): ReportParse {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    return { ok: false, problems: [{ path: "", message: `Not valid JSON: ${(err as Error).message}` }] };
  }
  const result = ReportSchema.safeParse(data);
  if (result.success) return { ok: true, report: result.data };
  return {
    ok: false,
    problems: result.error.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message })),
  };
}

/** Parse history.jsonl. Bad lines are skipped and counted, never fatal. */
export function parseHistory(text: string): { lines: HistoryLine[]; skipped: number } {
  const lines: HistoryLine[] = [];
  let skipped = 0;
  for (const raw of text.split("\n")) {
    const t = raw.trim();
    if (!t) continue;
    try {
      const r = HistoryLineSchema.safeParse(JSON.parse(t));
      if (r.success) lines.push(r.data);
      else skipped++;
    } catch {
      skipped++;
    }
  }
  lines.sort((a, b) => a.generated_at.localeCompare(b.generated_at));
  return { lines, skipped };
}
