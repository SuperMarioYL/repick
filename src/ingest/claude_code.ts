import { z } from "zod";
import { taskSig, type ToolDecision } from "./schema";

/**
 * Claude Code trace adapter.
 *
 * Hides Claude Code's trace-field naming behind a single normalize step. A
 * trace is JSONL; each line is one tool-selection event with its observable
 * outcome. The adapter lifts it into the agent-agnostic ToolDecision shape the
 * ledger and replay engine speak.
 *
 * Claude Code trace entry shape:
 *   { step, task, tool, args, available, resolved, secs, tokens, retried, fallback? }
 */

export const ClaudeCodeTraceEntrySchema = z.object({
  step: z.number().int().nonnegative(),
  task: z.string().min(1),
  tool: z.string().min(1),
  args: z.string().default(""),
  available: z.array(z.string()).default([]),
  resolved: z.boolean(),
  secs: z.number().nonnegative(),
  tokens: z.number().int().nonnegative(),
  retried: z.boolean().default(false),
  fallback: z.string().nullable().optional(),
});
export type ClaudeCodeTraceEntry = z.infer<typeof ClaudeCodeTraceEntrySchema>;

const AGENT = "claude-code";

export function ingestClaudeCode(runId: string, traceText: string): ToolDecision[] {
  const decisions: ToolDecision[] = [];
  const lines = splitLines(traceText);
  for (const { line, number } of lines) {
    const entry = parseEntry(line, number);
    decisions.push({
      run_id: runId,
      agent: AGENT,
      task_sig: taskSig(entry.task),
      step_idx: entry.step,
      tool: entry.tool,
      arg_summary: entry.args,
      available_tools: entry.available,
      outcome: {
        resolved: entry.resolved,
        secs: entry.secs,
        tokens: entry.tokens,
        retried: entry.retried,
        fallback: entry.fallback ?? null,
      },
    });
  }
  return decisions;
}

function splitLines(text: string): { line: string; number: number }[] {
  return text
    .split(/\r?\n/)
    .map((l, i) => ({ line: l, number: i + 1 }))
    .filter((e) => e.line.trim().length > 0);
}

function parseEntry(line: string, number: number): ClaudeCodeTraceEntry {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    throw new Error(`claude-code: invalid JSON on line ${number}: ${line.slice(0, 80)}`);
  }
  return ClaudeCodeTraceEntrySchema.parse(raw);
}
