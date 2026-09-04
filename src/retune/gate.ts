/**
 * MCP gating server (m2 milestone — stub in v0.1.0).
 *
 * m2 will spawn this on demand via the standard MCP stdio contract (the agent
 * spawns it; we do not run or supervise a daemon). It respects a
 * ToolAvailabilityConfig so blocked tools are unreachable on the next run,
 * closing the observe → compare → retune loop. m1 ships `record` + `ab` only.
 */
export function startGate(): void {
  throw new Error(
    "repick gate: not implemented in v0.1.0 (m1). The MCP gate ships in m2 — see the roadmap in README.md.",
  );
}
