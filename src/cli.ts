#!/usr/bin/env bun
import { Command } from "commander";
import { readFile } from "node:fs/promises";
import { initProject, ledgerDir } from "./config";
import { appendDecisions, listRuns, readRun } from "./ledger/store";
import { ingestClaudeCode } from "./ingest/claude_code";
import { ingestCodex } from "./ingest/codex";
import { computeABReport, summarizeTools } from "./replay/ab";
import { renderReport } from "./replay/report";

const VERSION = "0.1.0";

const program = new Command();

program
  .name("repick")
  .description("tool-choice empirical replay for coding agents")
  .version(VERSION);

program
  .command("init")
  .description("scaffold the .repick/ ledger directory")
  .action(async () => {
    const { ledger, created } = await initProject();
    console.log(created ? `repick: initialized ${ledger}` : `repick: ${ledger} already exists`);
  });

program
  .command("record <runId>")
  .description("ingest an agent trace into the ledger as ToolDecisions")
  .option(
    "-a, --agent <agent>",
    "agent that produced the trace (claude | codex)",
    "claude",
  )
  .option(
    "-t, --trace <path>",
    "path to the trace JSONL file (use - for stdin)",
    "-",
  )
  .action(async (runId: string, opts: { agent: string; trace: string }) => {
    const text =
      opts.trace === "-" ? await readStdin() : await readFile(opts.trace, "utf8");
    const agent = opts.agent.toLowerCase();
    let decisions;
    if (agent === "claude" || agent === "claude-code") {
      decisions = ingestClaudeCode(runId, text);
    } else if (agent === "codex") {
      decisions = ingestCodex(runId, text);
    } else {
      console.error(`repick: unknown agent "${opts.agent}" (expected claude | codex)`);
      process.exit(1);
    }
    await appendDecisions(ledgerDir(), runId, decisions);
    console.log(
      `repick: recorded ${decisions.length} tool decisions -> ${ledgerDir()}/${runId}.jsonl`,
    );
  });

program
  .command("ab <baseline> <candidate>")
  .description("compare two runs and print an outcome-graded A/B table")
  .option("-v, --verbose", "also print the per-task diff table")
  .action(async (baseline: string, candidate: string, opts: { verbose: boolean }) => {
    const [b, c] = await Promise.all([
      readRun(ledgerDir(), baseline),
      readRun(ledgerDir(), candidate),
    ]);
    const summaries = summarizeTools(b, c);
    const report = computeABReport(b, c);
    console.log(renderReport(baseline, candidate, summaries, report, opts.verbose));
  });

program
  .command("list")
  .description("list runs recorded in the ledger")
  .action(async () => {
    const runs = await listRuns(ledgerDir());
    if (runs.length === 0) {
      console.log("repick: no runs recorded yet (run `repick init`, then `repick record`)");
      return;
    }
    for (const r of runs) console.log(r);
  });

program
  .command("retune")
  .description("emit a ToolAvailabilityConfig from A/B verdicts (ships in m2)")
  .action(() => {
    console.log(
      "repick: `retune` ships in m2 (v0.1.0 ships `record` + `ab` only). See the roadmap in README.md.",
    );
  });

program
  .command("gate")
  .description("spawn the MCP gating server (ships in m2)")
  .action(() => {
    console.log(
      "repick: `gate` ships in m2 (v0.1.0 ships `record` + `ab` only). See the roadmap in README.md.",
    );
  });

program.parseAsync(process.argv).catch((err: Error) => {
  console.error(`repick: ${err.message}`);
  process.exit(1);
});

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}
