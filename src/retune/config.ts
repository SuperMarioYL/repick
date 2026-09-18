import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { ABReport, ToolAvailabilityConfig } from "../ingest/schema";

/**
 * Retune emitter (m2).
 *
 * Derives a ToolAvailabilityConfig from the A/B verdicts: every
 * baseline-wins task contributes its candidate tool to `blocked`; every
 * candidate-wins task contributes its baseline tool to `blocked`; each block
 * carries a pointer back to the A/B report that justified it. Manual
 * --block/--allow entries are merged on top so a human stays in the loop.
 */

export function emitToolAvailabilityConfig(report: ABReport): ToolAvailabilityConfig {
  const blocked = new Set<string>();
  for (const row of report.per_task) {
    if (row.verdict === "baseline-wins") blocked.add(row.candidate_tool);
    else if (row.verdict === "candidate-wins") blocked.add(row.baseline_tool);
  }
  return {
    allowed: [],
    blocked: [...blocked].sort(),
    evidence: `ab:${report.baseline_run}:${report.candidate_run}`,
  };
}

/** Apply manual overrides on top of the evidence-derived config.
 *  --allow wins over --block for the same tool (un-blocking is a human call). */
export function applyOverrides(
  config: ToolAvailabilityConfig,
  block: string[],
  allow: string[],
): ToolAvailabilityConfig {
  const blocked = new Set(config.blocked);
  for (const t of block) blocked.add(t);
  for (const t of allow) blocked.delete(t);
  return {
    allowed: [...new Set([...config.allowed, ...allow])].sort(),
    blocked: [...blocked].sort(),
    evidence: config.evidence,
  };
}

/** Path of the active retune config for a ledger root. */
export function retuneConfigPath(ledgerDir: string): string {
  return `${ledgerDir}/retune.json`;
}

/** Read the active ToolAvailabilityConfig, or null when none was emitted. */
export async function readActiveConfig(
  ledgerDir: string,
): Promise<ToolAvailabilityConfig | null> {
  const path = retuneConfigPath(ledgerDir);
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, "utf8")) as ToolAvailabilityConfig;
}
