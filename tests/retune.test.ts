import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeABReport } from "../src/replay/ab";
import { renderReport, renderRetuneEffect } from "../src/replay/report";
import { ingestClaudeCode } from "../src/ingest/claude_code";
import { appendDecisions, readRun } from "../src/ledger/store";
import {
  emitToolAvailabilityConfig,
  applyOverrides,
  readActiveConfig,
  retuneConfigPath,
} from "../src/retune/config";
import { checkTool, handleGateCall, gateToolDescriptors } from "../src/retune/gate";
import type { RunRecord, ToolDecision } from "../src/ingest/schema";

function mkRun(
  runId: string,
  rows: [string, string, boolean, number][],
  available: string[] = ["grep", "ripgrep", "lsp-symbol"],
): RunRecord {
  const decisions: ToolDecision[] = rows.map(([sig, tool, resolved, secs], i) => ({
    run_id: runId,
    agent: "claude-code",
    task_sig: sig,
    step_idx: i,
    tool,
    arg_summary: "",
    available_tools: available,
    outcome: { resolved, secs, tokens: 100, retried: false, fallback: null },
  }));
  return {
    run_id: runId,
    agent: "claude-code",
    config: { allowed: [], blocked: [], evidence: null },
    decisions,
  };
}

const RUN_A = mkRun("run-A", [
  ["t1", "grep", true, 20],
  ["t2", "grep", false, 30],
  ["t3", "grep", false, 10],
]);
const RUN_B = mkRun("run-B", [
  ["t1", "ripgrep", true, 8],
  ["t2", "ripgrep", true, 9],
  ["t3", "lsp-symbol", true, 7],
]);

describe("retune emitter", () => {
  test("blocks the losing tool from each decisive task, with evidence", () => {
    const report = computeABReport(RUN_A, RUN_B);
    const config = emitToolAvailabilityConfig(report);
    expect(config.blocked).toEqual(["grep"]);
    expect(config.evidence).toBe("ab:run-A:run-B");
  });

  test("manual overrides merge on top (allow wins over block)", () => {
    const config = applyOverrides(
      { allowed: [], blocked: ["grep", "fs"], evidence: "ab:run-A:run-B" },
      ["curl"],
      ["fs"],
    );
    expect(config.blocked).toEqual(["curl", "grep"]);
    expect(config.allowed).toEqual(["fs"]);
  });
});

describe("gate", () => {
  const config = { allowed: [], blocked: ["grep"], evidence: "ab:run-A:run-B" };

  test("checkTool denies blocked tools with evidence, allows the rest", () => {
    expect(checkTool(config, "grep")).toEqual({
      tool: "grep",
      allowed: false,
      blocked_by: "grep",
      evidence: "ab:run-A:run-B",
    });
    expect(checkTool(config, "ripgrep").allowed).toBe(true);
  });

  test("gate exposes check_tool + list_availability and answers calls", () => {
    const tools = gateToolDescriptors().map((t) => t.name);
    expect(tools).toEqual(["check_tool", "list_availability"]);
    const asText = (r: { content: Array<{ type: string; text?: string }> }) =>
      JSON.parse(r.content[0].text!);
    const deny = handleGateCall(config, "check_tool", { tool: "grep" });
    expect(deny.isError).toBeUndefined();
    expect(asText(deny).allowed).toBe(false);
    const list = handleGateCall(config, "list_availability", {});
    expect(asText(list).blocked).toEqual(["grep"]);
    const bad = handleGateCall(config, "nope", {});
    expect(bad.isError).toBe(true);
  });
});

describe("record stamping + ab retune effect", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "repick-retune-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("record stamps the active config's affordance set; ab renders the delta", async () => {
    // baseline recorded open
    await appendDecisions(dir, "run-A", RUN_A.decisions);
    // active retune blocks grep
    await writeFile(
      retuneConfigPath(dir),
      JSON.stringify({ allowed: [], blocked: ["grep"], evidence: "ab:run-A:run-B" }),
      "utf8",
    );
    expect((await readActiveConfig(dir))?.blocked).toEqual(["grep"]);
    // candidate recorded under the gate: available_tools minus blocked
    const trace = RUN_B.decisions
      .map((d) =>
        JSON.stringify({
          step: d.step_idx,
          task: d.task_sig.replace(/-/g, " "),
          tool: d.tool,
          args: "",
          available: ["grep", "ripgrep", "lsp-symbol"],
          resolved: d.outcome.resolved,
          secs: d.outcome.secs,
          tokens: d.outcome.tokens,
        }),
      )
      .join("\n");
    const stamped = ingestClaudeCode("run-B", trace);
    const blocked = new Set((await readActiveConfig(dir))!.blocked);
    for (const d of stamped) {
      d.available_tools = d.available_tools.filter((t) => !blocked.has(t));
    }
    expect(stamped[0].available_tools).not.toContain("grep");
    await appendDecisions(dir, "run-B", stamped);
    // ab renders the retune effect: grep unavailable in run-B
    const a = await readRun(dir, "run-A");
    const b = await readRun(dir, "run-B");
    const effect = renderRetuneEffect(a, b);
    expect(effect).toContain("Retune effect");
    expect(effect).toContain("| grep | 3 → 0 |");
    const out = renderReport("run-A", "run-B", [], computeABReport(a, b), false, {
      baseline: a,
      candidate: b,
    });
    expect(out).toContain("Retune effect");
    // no narrowed set -> no section
    expect(renderRetuneEffect(RUN_A, RUN_B)).toBeNull();
  });
});
