import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendDecisions, readRun, listRuns, writeRun } from "../src/ledger/store";
import type { ToolDecision } from "../src/ingest/schema";

function mkDecision(
  runId: string,
  sig: string,
  tool: string,
  resolved: boolean,
  secs: number,
): ToolDecision {
  return {
    run_id: runId,
    agent: "claude-code",
    task_sig: sig,
    step_idx: 0,
    tool,
    arg_summary: "",
    available_tools: ["grep", "ripgrep"],
    outcome: { resolved, secs, tokens: 100, retried: false, fallback: null },
  };
}

describe("ledger store", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "repick-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("append then read round-trips decisions", async () => {
    const decisions = [
      mkDecision("run-A", "refactor-auth-module", "grep", true, 12),
      mkDecision("run-A", "find-dead-code", "grep", false, 20),
    ];
    await appendDecisions(dir, "run-A", decisions);
    const run = await readRun(dir, "run-A");
    expect(run.run_id).toBe("run-A");
    expect(run.agent).toBe("claude-code");
    expect(run.decisions).toHaveLength(2);
    expect(run.decisions[0].tool).toBe("grep");
  });

  test("append is streaming-safe (extends an existing run)", async () => {
    await appendDecisions(dir, "run-A", [
      mkDecision("run-A", "task-a", "grep", true, 5),
    ]);
    await appendDecisions(dir, "run-A", [
      mkDecision("run-A", "task-b", "grep", true, 6),
    ]);
    const run = await readRun(dir, "run-A");
    expect(run.decisions).toHaveLength(2);
  });

  test("readRun throws on a missing run", async () => {
    await expect(readRun(dir, "nope")).rejects.toThrow(/run not found/);
  });

  test("listRuns lists recorded runs sorted, without extension", async () => {
    await appendDecisions(dir, "run-B", [
      mkDecision("run-B", "t", "grep", true, 1),
    ]);
    await appendDecisions(dir, "run-A", [
      mkDecision("run-A", "t", "grep", true, 1),
    ]);
    expect(await listRuns(dir)).toEqual(["run-A", "run-B"]);
  });

  test("writeRun overwrites the run instead of appending", async () => {
    await writeRun(dir, "run-A", [
      mkDecision("run-A", "task-a", "grep", true, 5),
    ]);
    await writeRun(dir, "run-A", [
      mkDecision("run-A", "task-z", "grep", true, 7),
    ]);
    const run = await readRun(dir, "run-A");
    expect(run.decisions).toHaveLength(1);
    expect(run.decisions[0].task_sig).toBe("task-z");
  });
});
