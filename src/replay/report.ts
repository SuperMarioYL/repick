import type { ABReport } from "../ingest/schema";
import { flagLosingTool, type ToolSummary } from "./ab";

/**
 * Report renderer.
 *
 * Emits a markdown table (the README hero and the artifact the GTM asks users
 * to paste into issues). Markdown was chosen deliberately over a box-drawing
 * table so the output renders on GitHub and survives a copy-paste.
 */

export function renderToolTable(
  baselineRunId: string,
  candidateRunId: string,
  summaries: ToolSummary[],
): string {
  const header =
    "| tool | run | picks | resolved | avg-secs | tokens | verdict | retune hint |";
  const sep = "| --- | --- | --- | --- | --- | --- | --- | --- |";
  const rows = summaries.map((s) => {
    const run = s.side === "baseline" ? baselineRunId : candidateRunId;
    return `| ${s.tool} | ${run} | ${s.picks} | ${s.tasks_resolved} | ${s.avg_secs} | ${s.tokens} | ${s.verdict} | ${s.retune_hint} |`;
  });
  return [header, sep, ...rows].join("\n");
}

export function renderPerTask(report: ABReport): string {
  const header =
    "| task_sig | baseline | candidate | Δsecs | Δresolved | verdict | retune hint |";
  const sep = "| --- | --- | --- | --- | --- | --- | --- |";
  const rows = report.per_task.map(
    (r) =>
      `| ${r.task_sig} | ${r.baseline_tool} | ${r.candidate_tool} | ${r.delta_secs > 0 ? "+" : ""}${r.delta_secs} | ${r.delta_resolved > 0 ? "+" : ""}${r.delta_resolved} | ${r.verdict} | ${r.retune_hint || "—"} |`,
  );
  return [header, sep, ...rows].join("\n");
}

/** Full `repick ab` report: tool table + losing-tool flag (+ per-task if verbose). */
export function renderReport(
  baselineRunId: string,
  candidateRunId: string,
  summaries: ToolSummary[],
  report: ABReport,
  verbose = false,
): string {
  const lines: string[] = [];
  lines.push(`repick ab — ${baselineRunId} vs ${candidateRunId}`);
  lines.push("");
  lines.push(renderToolTable(baselineRunId, candidateRunId, summaries));
  const loser = flagLosingTool(summaries);
  lines.push("");
  if (loser) {
    lines.push(`Losing tool: ${loser.tool} (${loser.run_id}) — ${loser.retune_hint}`);
  } else {
    lines.push("No decisive losing tool across the compared tasks.");
  }
  if (verbose) {
    lines.push("");
    lines.push("Per-task diff:");
    lines.push(renderPerTask(report));
  }
  return lines.join("\n");
}
