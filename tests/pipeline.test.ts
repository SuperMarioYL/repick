import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendDecisions, readRun } from "../src/ledger/store";
import { ingestClaudeCode } from "../src/ingest/claude_code";
import { ingestCodex } from "../src/ingest/codex";
import { computeABReport, summarizeTools, flagLosingTool } from "../src/replay/ab";
import { renderReport } from "../src/replay/report";

const examplesDir = join(import.meta.dirname, "..", "examples");

describe("end-to-end on the sample traces", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "repick-e2e-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("record two runs, ab them, flag grep as the loser", async () => {
    const aTrace = await readFile(
      join(examplesDir, "claude-code-trace.jsonl"),
      "utf8",
    );
    const bTrace = await readFile(
      join(examplesDir, "codex-trace.jsonl"),
      "utf8",
    );

    await appendDecisions(dir, "run-A", ingestClaudeCode("run-A", aTrace));
    await appendDecisions(dir, "run-B", ingestCodex("run-B", bTrace));

    const a = await readRun(dir, "run-A");
    const b = await readRun(dir, "run-B");

    const s = summarizeTools(a, b);
    const r = computeABReport(a, b);
    const out = renderReport("run-A", "run-B", s, r, true);

    expect(out).toContain("Losing tool: grep");
    expect(out).toContain("ripgrep");
    expect(out).toContain("lsp-symbol");
    expect(out).toContain("Per-task diff");

    const loser = flagLosingTool(s);
    expect(loser?.tool).toBe("grep");
    expect(loser?.run_id).toBe("run-A");
  });
});
