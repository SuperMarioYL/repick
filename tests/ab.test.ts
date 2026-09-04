import { test, expect, describe } from "bun:test";
import { computeABReport, summarizeTools, flagLosingTool } from "../src/replay/ab";
import { renderReport } from "../src/replay/report";
import type { RunRecord, ToolDecision } from "../src/ingest/schema";

// rows: [task_sig, tool, resolved, secs, tokens]
function mkRun(
  runId: string,
  agent: string,
  rows: [string, string, boolean, number, number][],
): RunRecord {
  const decisions: ToolDecision[] = rows.map(
    ([sig, tool, resolved, secs, tokens], i) => ({
      run_id: runId,
      agent,
      task_sig: sig,
      step_idx: i,
      tool,
      arg_summary: "",
      available_tools: ["grep", "ripgrep", "lsp-symbol"],
      outcome: { resolved, secs, tokens, retried: false, fallback: null },
    }),
  );
  return {
    run_id: runId,
    agent,
    config: { allowed: [], blocked: [], evidence: null },
    decisions,
  };
}

describe("computeABReport verdicts", () => {
  test("candidate-wins when candidate is faster and both resolve", () => {
    const b = mkRun("A", "claude-code", [["t", "grep", true, 20, 500]]);
    const c = mkRun("B", "codex", [["t", "lsp-symbol", true, 8, 300]]);
    const r = computeABReport(b, c);
    expect(r.per_task[0].verdict).toBe("candidate-wins");
    expect(r.per_task[0].delta_secs).toBe(-12);
    expect(r.per_task[0].retune_hint).toBe("block grep on t");
  });

  test("baseline-wins when candidate failed but baseline resolved", () => {
    const b = mkRun("A", "claude-code", [["t", "grep", true, 10, 500]]);
    const c = mkRun("B", "codex", [["t", "ripgrep", false, 12, 600]]);
    const r = computeABReport(b, c);
    expect(r.per_task[0].verdict).toBe("baseline-wins");
    expect(r.per_task[0].retune_hint).toBe("block ripgrep on t");
  });

  test("inconclusive when neither resolves", () => {
    const b = mkRun("A", "claude-code", [["t", "grep", false, 10, 500]]);
    const c = mkRun("B", "codex", [["t", "grep", false, 9, 400]]);
    const r = computeABReport(b, c);
    expect(r.per_task[0].verdict).toBe("inconclusive");
    expect(r.per_task[0].retune_hint).toBe("");
  });

  test("tie when both resolve within 5%", () => {
    const b = mkRun("A", "claude-code", [["t", "grep", true, 100, 500]]);
    const c = mkRun("B", "codex", [["t", "ripgrep", true, 101, 500]]);
    const r = computeABReport(b, c);
    expect(r.per_task[0].verdict).toBe("tie");
  });

  test("only tasks present in both runs compare", () => {
    const b = mkRun("A", "claude-code", [
      ["t1", "grep", true, 10, 100],
      ["only-b", "grep", true, 5, 50],
    ]);
    const c = mkRun("B", "codex", [
      ["t1", "ripgrep", true, 8, 90],
      ["only-c", "ripgrep", true, 7, 80],
    ]);
    const r = computeABReport(b, c);
    expect(r.per_task).toHaveLength(1);
    expect(r.per_task[0].task_sig).toBe("t1");
  });
});

describe("summarizeTools", () => {
  const b = mkRun("run-A", "claude-code", [
    ["refactor-auth", "grep", true, 24, 1100],
    ["find-dead", "grep", false, 31, 1400],
    ["rename-sym", "grep", true, 18, 820],
  ]);
  const c = mkRun("run-B", "codex", [
    ["refactor-auth", "lsp-symbol", true, 9, 540],
    ["find-dead", "ripgrep", true, 7, 360],
    ["rename-sym", "lsp-symbol", true, 6, 300],
  ]);

  test("produces a loser row for grep and winner rows for the candidate tools", () => {
    const s = summarizeTools(b, c);
    const grep = s.find((r) => r.tool === "grep");
    expect(grep?.verdict).toBe("loser");
    expect(grep?.picks).toBe(3);
    expect(grep?.tasks_resolved).toBe(2);
    expect(grep?.retune_hint).toContain("block grep");

    const lsp = s.find((r) => r.tool === "lsp-symbol");
    expect(lsp?.verdict).toBe("winner");
    expect(lsp?.picks).toBe(2);
    expect(lsp?.tasks_resolved).toBe(2);

    const rg = s.find((r) => r.tool === "ripgrep");
    expect(rg?.verdict).toBe("winner");
    expect(rg?.picks).toBe(1);
  });

  test("flagLosingTool returns grep on run-A", () => {
    const s = summarizeTools(b, c);
    const loser = flagLosingTool(s);
    expect(loser?.tool).toBe("grep");
    expect(loser?.run_id).toBe("run-A");
  });
});

describe("renderReport", () => {
  test("renders a markdown table and flags the losing tool", () => {
    const b = mkRun("run-A", "claude-code", [["t", "grep", true, 24, 1100]]);
    const c = mkRun("run-B", "codex", [["t", "lsp-symbol", true, 9, 540]]);
    const s = summarizeTools(b, c);
    const r = computeABReport(b, c);
    const out = renderReport("run-A", "run-B", s, r);
    expect(out).toContain("| tool | run | picks |");
    expect(out).toContain("grep");
    expect(out).toContain("Losing tool: grep");
  });

  test("verbose mode appends the per-task diff", () => {
    const b = mkRun("run-A", "claude-code", [["t", "grep", true, 24, 1100]]);
    const c = mkRun("run-B", "codex", [["t", "lsp-symbol", true, 9, 540]]);
    const out = renderReport(
      "run-A",
      "run-B",
      summarizeTools(b, c),
      computeABReport(b, c),
      true,
    );
    expect(out).toContain("Per-task diff");
    expect(out).toContain("Δsecs");
  });
});
