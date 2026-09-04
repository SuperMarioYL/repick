import type {
  ABReport,
  ABTaskRow,
  Outcome,
  RunRecord,
  ToolDecision,
  Verdict,
} from "../ingest/schema";

/**
 * The A/B engine: the owned knowledge of repick.
 *
 * It joins decisions across two runs by task_sig (a normalized task fingerprint
 * stable across runs of the same intent) and diffs the per-task outcome of the
 * tool each run reached for first. The verdict names which run's pick won; the
 * per-tool summary rolls those verdicts up into the table the README shows.
 */

export type ToolSummary = {
  tool: string;
  run_id: string;
  side: "baseline" | "candidate";
  picks: number;
  tasks_resolved: number;
  avg_secs: number;
  tokens: number;
  verdict: "winner" | "loser" | "tie" | "—";
  retune_hint: string;
};

type TaskRep = { rep: ToolDecision; outcome: Outcome };

function round(n: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** Aggregate a run's decisions for one task into a single outcome.
 *  resolved = any step resolved it; secs/tokens = summed cost; retried = any
 *  step retried; fallback = first observed fallback tool (if any). */
function aggregateOutcome(decisions: ToolDecision[]): Outcome {
  return {
    resolved: decisions.some((d) => d.outcome.resolved),
    secs: decisions.reduce((s, d) => s + d.outcome.secs, 0),
    tokens: decisions.reduce((s, d) => s + d.outcome.tokens, 0),
    retried: decisions.some((d) => d.outcome.retried),
    fallback:
      decisions
        .map((d) => d.outcome.fallback)
        .find((f): f is string => typeof f === "string") ?? null,
  };
}

/** Group a run's decisions by task_sig. Representative = first decision (the
 *  first tool the agent reached for on that task); outcome = aggregate. */
function groupByTask(run: RunRecord): Map<string, TaskRep> {
  const byTask = new Map<string, ToolDecision[]>();
  for (const d of run.decisions) {
    const arr = byTask.get(d.task_sig) ?? [];
    arr.push(d);
    byTask.set(d.task_sig, arr);
  }
  const reps = new Map<string, TaskRep>();
  for (const [sig, decs] of byTask) {
    reps.set(sig, { rep: decs[0], outcome: aggregateOutcome(decs) });
  }
  return reps;
}

function verdictFor(
  baseline: Outcome,
  candidate: Outcome,
): { verdict: Verdict; delta_secs: number; delta_resolved: number } {
  const delta_secs = round(candidate.secs - baseline.secs);
  const delta_resolved = (candidate.resolved ? 1 : 0) - (baseline.resolved ? 1 : 0);
  let verdict: Verdict;
  if (!baseline.resolved && !candidate.resolved) {
    verdict = "inconclusive";
  } else if (candidate.resolved && !baseline.resolved) {
    verdict = "candidate-wins";
  } else if (baseline.resolved && !candidate.resolved) {
    verdict = "baseline-wins";
  } else {
    // both resolved: faster wins; within 5% (or 0.5s for tiny tasks) is a tie
    const threshold = Math.max(baseline.secs, candidate.secs) * 0.05 || 0.5;
    verdict =
      Math.abs(candidate.secs - baseline.secs) <= threshold
        ? "tie"
        : candidate.secs < baseline.secs
          ? "candidate-wins"
          : "baseline-wins";
  }
  return { verdict, delta_secs, delta_resolved };
}

/** Compute the per-task A/B report. Only tasks present in BOTH runs compare. */
export function computeABReport(
  baseline: RunRecord,
  candidate: RunRecord,
): ABReport {
  const base = groupByTask(baseline);
  const cand = groupByTask(candidate);
  const per_task: ABTaskRow[] = [];
  for (const sig of new Set([...base.keys(), ...cand.keys()])) {
    const b = base.get(sig);
    const c = cand.get(sig);
    if (!b || !c) continue;
    const { verdict, delta_secs, delta_resolved } = verdictFor(b.outcome, c.outcome);
    let retune_hint = "";
    if (verdict === "baseline-wins") {
      retune_hint = `block ${c.rep.tool} on ${sig}`;
    } else if (verdict === "candidate-wins") {
      retune_hint = `block ${b.rep.tool} on ${sig}`;
    }
    per_task.push({
      task_sig: sig,
      baseline_tool: b.rep.tool,
      candidate_tool: c.rep.tool,
      delta_secs,
      delta_resolved,
      verdict,
      retune_hint,
    });
  }
  per_task.sort((a, z) => a.task_sig.localeCompare(z.task_sig));
  return { baseline_run: baseline.run_id, candidate_run: candidate.run_id, per_task };
}

/** Roll the per-task verdicts up into a per-(run, tool) summary table. */
export function summarizeTools(
  baseline: RunRecord,
  candidate: RunRecord,
): ToolSummary[] {
  const report = computeABReport(baseline, candidate);
  const verdictByTask = new Map(
    report.per_task.map((r) => [r.task_sig, r.verdict] as const),
  );

  const buildSide = (
    run: RunRecord,
    reps: Map<string, TaskRep>,
    side: "baseline" | "candidate",
  ): ToolSummary[] => {
    const byTool = new Map<string, TaskRep[]>();
    for (const tr of reps.values()) {
      const arr = byTool.get(tr.rep.tool) ?? [];
      arr.push(tr);
      byTool.set(tr.rep.tool, arr);
    }
    const rows: ToolSummary[] = [];
    for (const [tool, tasks] of byTool) {
      const picks = tasks.length;
      const tasks_resolved = tasks.filter((t) => t.outcome.resolved).length;
      const avg_secs = round(
        tasks.reduce((s, t) => s + t.outcome.secs, 0) / picks,
      );
      const tokens = tasks.reduce((s, t) => s + t.outcome.tokens, 0);
      let wins = 0;
      let losses = 0;
      for (const t of tasks) {
        const v = verdictByTask.get(t.rep.task_sig);
        if (v === "baseline-wins") side === "baseline" ? wins++ : losses++;
        else if (v === "candidate-wins") side === "candidate" ? wins++ : losses++;
      }
      let verdict: ToolSummary["verdict"];
      let hint: string;
      if (wins > losses) {
        verdict = "winner";
        hint = "—";
      } else if (losses > wins) {
        verdict = "loser";
        hint = `block ${tool} (lost ${losses} task${losses > 1 ? "s" : ""})`;
      } else if (wins > 0) {
        verdict = "tie";
        hint = "—";
      } else {
        verdict = "—";
        hint = "—";
      }
      rows.push({
        tool,
        run_id: run.run_id,
        side,
        picks,
        tasks_resolved,
        avg_secs,
        tokens,
        verdict,
        retune_hint: hint,
      });
    }
    rows.sort((a, z) => a.tool.localeCompare(z.tool));
    return rows;
  };

  return [
    ...buildSide(baseline, groupByTask(baseline), "baseline"),
    ...buildSide(candidate, groupByTask(candidate), "candidate"),
  ];
}

/** The single tool to flag as the loser (most lost tasks; ties → most picks). */
export function flagLosingTool(summaries: ToolSummary[]): ToolSummary | null {
  const losers = summaries.filter((s) => s.verdict === "loser");
  if (losers.length === 0) return null;
  return losers.sort((a, z) => z.picks - a.picks)[0];
}
