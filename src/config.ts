import { join } from "node:path";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";

/**
 * .repick/ project layout.
 *
 *   .repick/            ledger root (gitignored — local run data, not source)
 *   .repick/runs/       one <runId>.jsonl per recorded run
 *
 * v0.1 is local single-user: no config file is written, because the only
 * configurable knob (the ToolAvailabilityConfig) is an m2 artifact produced by
 * `repick retune`. `init` just makes sure the ledger exists.
 */

export const LEDGER_DIRNAME = ".repick";
export const RUNS_DIRNAME = ".repick/runs";

export function ledgerDir(cwd: string = process.cwd()): string {
  return join(cwd, LEDGER_DIRNAME);
}

export function runsDir(cwd: string = process.cwd()): string {
  return join(cwd, RUNS_DIRNAME);
}

export type InitResult = {
  ledger: string;
  runs: string;
  created: boolean;
};

/** Scaffold the ledger directory. Idempotent — safe to re-run. */
export async function initProject(cwd: string = process.cwd()): Promise<InitResult> {
  const ledger = ledgerDir(cwd);
  const runs = runsDir(cwd);
  const created = !existsSync(ledger);
  await mkdir(runs, { recursive: true });
  await writeFile(join(runs, ".gitkeep"), "", "utf8");
  return { ledger, runs, created };
}
