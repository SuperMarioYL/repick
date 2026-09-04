import { z } from "zod";

/**
 * Core data model for repick.
 *
 * The new primitive is the ToolDecision: a tool-selection moment lifted out of
 * the trace and joined to its observable outcome, making tool-choice a
 * first-class comparable unit instead of an invisible side effect of the run.
 *
 * All types are derived from zod schemas so the ingest adapters can validate
 * untrusted agent-trace JSON against the same contract the ledger enforces.
 */

// --- Verdict: outcome of one task, baseline vs candidate ---------------------

export const VerdictSchema = z.enum([
  "baseline-wins",
  "candidate-wins",
  "tie",
  "inconclusive",
]);
export type Verdict = z.infer<typeof VerdictSchema>;

// --- Outcome: what happened after a tool was picked --------------------------

export const OutcomeSchema = z.object({
  resolved: z.boolean(),
  secs: z.number().nonnegative(),
  tokens: z.number().int().nonnegative(),
  retried: z.boolean(),
  fallback: z.string().nullable().optional(),
});
export type Outcome = z.infer<typeof OutcomeSchema>;

// --- ToolDecision: the core primitive ---------------------------------------
//  what was picked (tool, arg_summary), what could have been picked
//  (available_tools), and the observable outcome of the sub-task it served.

export const ToolDecisionSchema = z.object({
  run_id: z.string().min(1),
  agent: z.string().min(1),
  task_sig: z.string().min(1),
  step_idx: z.number().int().nonnegative(),
  tool: z.string().min(1),
  arg_summary: z.string(),
  available_tools: z.array(z.string()),
  outcome: OutcomeSchema,
});
export type ToolDecision = z.infer<typeof ToolDecisionSchema>;

// --- ToolAvailabilityConfig: the retune knob (emitted in m2) ----------------
//  a list of tools to block or allow, each carrying a pointer back to the A/B
//  evidence that justified it. Part of RunRecord so a run remembers which
//  affordance set the agent ran under.

export const ToolAvailabilityConfigSchema = z.object({
  allowed: z.array(z.string()),
  blocked: z.array(z.string()),
  evidence: z.string().nullable(),
});
export type ToolAvailabilityConfig = z.infer<typeof ToolAvailabilityConfigSchema>;

// --- RunRecord: one recorded run + the decisions it produced ----------------

export const RunRecordSchema = z.object({
  run_id: z.string().min(1),
  agent: z.string().min(1),
  config: ToolAvailabilityConfigSchema,
  decisions: z.array(ToolDecisionSchema),
});
export type RunRecord = z.infer<typeof RunRecordSchema>;

// --- A/B report: per-task diff between two runs -----------------------------

export const ABTaskRowSchema = z.object({
  task_sig: z.string().min(1),
  baseline_tool: z.string(),
  candidate_tool: z.string(),
  delta_secs: z.number(),
  delta_resolved: z.number(),
  verdict: VerdictSchema,
  retune_hint: z.string().optional(),
});
export type ABTaskRow = z.infer<typeof ABTaskRowSchema>;

export const ABReportSchema = z.object({
  baseline_run: z.string().min(1),
  candidate_run: z.string().min(1),
  per_task: z.array(ABTaskRowSchema),
});
export type ABReport = z.infer<typeof ABReportSchema>;

// --- task_sig: stable cross-run task fingerprint ----------------------------
//  Normalizes a free-form task description into a canonical slug so two runs of
//  the same intent join even when the wording differs in case/punctuation/
//  whitespace. Letters and digits in any script are preserved as word chars;
//  everything else collapses to a single dash.

export function taskSig(task: string): string {
  return task
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

// The baseline affordance set a run ships with before any retune is applied.
// m1 records runs under an open config; m2's retune emitter populates this.
export const OPEN_CONFIG: ToolAvailabilityConfig = {
  allowed: [],
  blocked: [],
  evidence: null,
};
