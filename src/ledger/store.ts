import { mkdir, readdir, readFile, appendFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  ToolDecisionSchema,
  RunRecordSchema,
  OPEN_CONFIG,
  type ToolDecision,
  type RunRecord,
} from "../ingest/schema";

/**
 * JSONL ledger on disk.
 *
 * One file per run: <ledgerDir>/<runId>.jsonl. Each line is one ToolDecision,
 * appended as the trace streams in, so a long run can be recorded without
 * buffering the whole trace in memory. Run metadata (run_id, agent, config)
 * is read back from the decisions themselves — every ToolDecision carries
 * its run_id and agent — so the file stays a pure append-only stream.
 */

export async function ensureLedger(ledgerDir: string): Promise<void> {
  await mkdir(ledgerDir, { recursive: true });
}

function runFile(ledgerDir: string, runId: string): string {
  return join(ledgerDir, `${runId}.jsonl`);
}

/** Append ToolDecisions to a run's ledger file (streaming-safe). */
export async function appendDecisions(
  ledgerDir: string,
  runId: string,
  decisions: ToolDecision[],
): Promise<void> {
  await ensureLedger(ledgerDir);
  if (decisions.length === 0) return;
  const block = decisions.map((d) => JSON.stringify(d)).join("\n") + "\n";
  await appendFile(runFile(ledgerDir, runId), block, "utf8");
}

/** Overwrite a run's ledger file with the given decisions (used by tests/seed). */
export async function writeRun(
  ledgerDir: string,
  runId: string,
  decisions: ToolDecision[],
): Promise<void> {
  await ensureLedger(ledgerDir);
  const block = decisions.map((d) => JSON.stringify(d)).join("\n") + "\n";
  await writeFile(runFile(ledgerDir, runId), block, "utf8");
}

/** Read a run back as a RunRecord, validating every line against the schema. */
export async function readRun(ledgerDir: string, runId: string): Promise<RunRecord> {
  const file = runFile(ledgerDir, runId);
  if (!existsSync(file)) {
    throw new Error(`run not found: ${runId} (looked for ${file})`);
  }
  const text = await readFile(file, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    throw new Error(`run "${runId}" has no recorded decisions`);
  }
  const decisions: ToolDecision[] = [];
  for (const [i, line] of lines.entries()) {
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      throw new Error(`invalid JSON in ${runId} on line ${i + 1}`);
    }
    decisions.push(ToolDecisionSchema.parse(raw));
  }
  const first = decisions[0];
  return RunRecordSchema.parse({
    run_id: first.run_id,
    agent: first.agent,
    config: OPEN_CONFIG,
    decisions,
  });
}

/** List the run ids currently in the ledger (sorted, without extension). */
export async function listRuns(ledgerDir: string): Promise<string[]> {
  let names: string[];
  try {
    names = await readdir(ledgerDir);
  } catch {
    return [];
  }
  return names
    .filter((n) => n.endsWith(".jsonl"))
    .map((n) => n.slice(0, -".jsonl".length))
    .sort();
}
