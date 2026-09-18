#!/usr/bin/env bun
import { Command } from "commander";
import { readFile } from "node:fs/promises";
import { initProject, ledgerDir } from "./config";
import { appendDecisions, listRuns, readRun } from "./ledger/store";
import { ingestClaudeCode } from "./ingest/claude_code";
import { ingestCodex } from "./ingest/codex";
import { computeABReport, summarizeTools } from "./replay/ab";
import { renderReport } from "./replay/report";
import {
  applyOverrides,
  emitToolAvailabilityConfig,
  readActiveConfig,
  retuneConfigPath,
} from "./retune/config";
import { startGate } from "./retune/gate";
import { writeFile } from "node:fs/promises";

const VERSION = "0.2.0";

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
    // Stamp the affordance set this run actually operates under: when an
    // active retune config blocks tools, they are not available to pick.
    const config = await readActiveConfig(ledgerDir());
    if (config) {
      const blocked = new Set(config.blocked);
      for (const d of decisions) {
        d.available_tools = d.available_tools.filter((t) => !blocked.has(t));
      }
    }
    await appendDecisions(ledgerDir(), runId, decisions);
    console.log(
      `repick: recorded ${decisions.length} tool decisions -> ${ledgerDir()}/runs/${runId}.jsonl`,
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
    console.log(
      renderReport(baseline, candidate, summaries, report, opts.verbose, {
        baseline: b,
        candidate: c,
      }),
    );
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
  .command("retune <baseline> <candidate>")
  .description("emit a ToolAvailabilityConfig from A/B verdicts")
  .option("--block <tool...>", "also block these tools (manual override)")
  .option("--allow <tool...>", "un-block these tools (manual override wins)")
  .option("--dry-run", "print the config instead of writing it")
  .action(
    async (
      baseline: string,
      candidate: string,
      opts: { block?: string[]; allow?: string[]; dryRun?: boolean },
    ) => {
      const [b, c] = await Promise.all([
        readRun(ledgerDir(), baseline),
        readRun(ledgerDir(), candidate),
      ]);
      const report = computeABReport(b, c);
      let config = emitToolAvailabilityConfig(report);
      config = applyOverrides(config, opts.block ?? [], opts.allow ?? []);
      if (config.blocked.length === 0 && (opts.block ?? []).length === 0) {
        console.log(
          `repick: no decisive losing tool between ${baseline} and ${candidate} — nothing to retune (use --block to force).`,
        );
        return;
      }
      const json = JSON.stringify(config, null, 2);
      if (opts.dryRun) {
        console.log(json);
        return;
      }
      await writeFile(retuneConfigPath(ledgerDir()), json, "utf8");
      console.log(
        `repick: emitted ${retuneConfigPath(ledgerDir())} — blocked: [${config.blocked.join(", ")}] (evidence: ${config.evidence})`,
      );
    },
  );

program
  .command("gate")
  .description("spawn the MCP gating server over stdio (respects .repick/retune.json)")
  .action(async () => {
    await startGate(ledgerDir());
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
