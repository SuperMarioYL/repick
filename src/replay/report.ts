import type { ABReport, RunRecord } from "../ingest/schema";
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
    "| tool | run | picks | resolved | avg-secs | tokens | W/L | verdict | retune hint |";
  const sep = "| --- | --- | --- | --- | --- | --- | --- | --- | --- |";
  const rows = summaries.map((s) => {
    const run = s.side === "baseline" ? baselineRunId : candidateRunId;
    return `| ${s.tool} | ${run} | ${s.picks} | ${s.tasks_resolved} | ${s.avg_secs} | ${s.tokens} | ${s.wins}/${s.losses} | ${s.verdict} | ${s.retune_hint} |`;
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

/** The affordance set a run was recorded under: union of its decisions'
 *  available_tools (empty unions are treated as "unknown", not "nothing"). */
function affordanceSet(run: RunRecord): Set<string> | null {
  const tools = new Set<string>();
  for (const d of run.decisions) {
    if (d.available_tools.length > 0) {
      for (const t of d.available_tools) tools.add(t);
    }
  }
  return tools.size > 0 ? tools : null;
}

/** Retune-effect section: when the candidate run was recorded under a narrower
 *  affordance set than the baseline (a blocked tool is missing from it), show
 *  the before/after delta per blocked tool — its picks in the baseline vs the
 *  candidate — so the effect of the retune is visible in the next `ab`. */
export function renderRetuneEffect(
  baseline: RunRecord,
  candidate: RunRecord,
): string | null {
  const base = affordanceSet(baseline);
  const cand = affordanceSet(candidate);
  if (!base || !cand) return null;
  const removed = [...base].filter((t) => !cand.has(t)).sort();
  if (removed.length === 0) return null;
  const lines: string[] = [];
  lines.push("Retune effect (candidate ran under a narrowed ToolAvailabilityConfig):");
  const header = "| blocked tool | picks baseline → candidate |";
  const sep = "| --- | --- |";
  const rows = removed.map((t) => {
    const basePicks = baseline.decisions.filter((d) => d.tool === t).length;
    const candPicks = candidate.decisions.filter((d) => d.tool === t).length;
    return `| ${t} | ${basePicks} → ${candPicks} |`;
  });
  lines.push(header, sep, ...rows);
  return lines.join("\n");
}

/** Full `repick ab` report: tool table + losing-tool flag (+ per-task if verbose). */
export function renderReport(
  baselineRunId: string,
  candidateRunId: string,
  summaries: ToolSummary[],
  report: ABReport,
  verbose = false,
  runs?: { baseline: RunRecord; candidate: RunRecord },
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
  if (runs) {
    const effect = renderRetuneEffect(runs.baseline, runs.candidate);
    if (effect) {
      lines.push("");
      lines.push(effect);
    }
  }
  if (verbose) {
    lines.push("");
    lines.push("Per-task diff:");
    lines.push(renderPerTask(report));
  }
  return lines.join("\n");
}
