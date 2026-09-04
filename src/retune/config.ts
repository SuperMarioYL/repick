import type { ABReport, ToolAvailabilityConfig } from "../ingest/schema";

/**
 * Retune emitter (m2 milestone — stub in v0.1.0).
 *
 * m2 will derive a ToolAvailabilityConfig from the A/B verdicts: every
 * baseline-wins task contributes its candidate tool to `blocked`; every
 * candidate-wins task contributes its baseline tool to `blocked`; each block
 * carries a pointer back to the A/B report that justified it. m1 ships
 * `record` + `ab` only — the retune loop closes in m2.
 */
export function emitToolAvailabilityConfig(
  _report: ABReport,
): ToolAvailabilityConfig {
  throw new Error(
    "repick retune: not implemented in v0.1.0 (m1). The retune emitter ships in m2 — see the roadmap in README.md.",
  );
}
