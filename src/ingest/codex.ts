import { z } from "zod";
import { taskSig, type ToolDecision } from "./schema";

/**
 * Codex trace adapter.
 *
 * Hides Codex's trace-field naming (name vs tool, intent vs task, ok vs
 * resolved, duration_ms vs secs, tokens_in vs tokens) behind the same
 * ToolDecision shape the Claude Code adapter emits. Two different agents, one
 * comparable unit — that normalization is the point of the ingest layer.
 *
 * Codex trace entry shape:
 *   { seq, intent, name, summary, tools, ok, duration_ms, tokens_in, retried, fallback? }
 */

export const CodexTraceEntrySchema = z.object({
  seq: z.number().int().nonnegative(),
  intent: z.string().min(1),
  name: z.string().min(1),
  summary: z.string().default(""),
  tools: z.array(z.string()).default([]),
  ok: z.boolean(),
  duration_ms: z.number().nonnegative(),
  tokens_in: z.number().int().nonnegative(),
  retried: z.boolean().default(false),
  fallback: z.string().nullable().optional(),
});
export type CodexTraceEntry = z.infer<typeof CodexTraceEntrySchema>;

const AGENT = "codex";

export function ingestCodex(runId: string, traceText: string): ToolDecision[] {
  const decisions: ToolDecision[] = [];
  const lines = splitLines(traceText);
  for (const { line, number } of lines) {
    const entry = parseEntry(line, number);
    decisions.push({
      run_id: runId,
      agent: AGENT,
      task_sig: taskSig(entry.intent),
      step_idx: entry.seq,
      tool: entry.name,
      arg_summary: entry.summary,
      available_tools: entry.tools,
      outcome: {
        resolved: entry.ok,
        secs: entry.duration_ms / 1000,
        tokens: entry.tokens_in,
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

function parseEntry(line: string, number: number): CodexTraceEntry {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    throw new Error(`codex: invalid JSON on line ${number}: ${line.slice(0, 80)}`);
  }
  return CodexTraceEntrySchema.parse(raw);
}
