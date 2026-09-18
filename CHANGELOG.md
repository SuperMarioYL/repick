# Changelog

## [0.2.0] — 2026-09-19

- **m2 retune loop** — `repick retune <baseline> <candidate>` now derives a `ToolAvailabilityConfig` from the A/B verdicts (blocked tools + the `ab:<run>:<run>` evidence pointer), honors `--block` / `--allow` manual overrides, and writes `.repick/retune.json` (`--dry-run` prints it). `repick gate` serves it over MCP stdio (`check_tool` / `list_availability`) so the agent consults the gate before tool use; `record` stamps the run's `available_tools` with the active config so `ab` renders a **Retune effect** before/after delta row per blocked tool.
- **fix: CI green again** — `ci.yml` pinned Bun 1.1 but the lockfile is `lockfileVersion: 2` (Bun ≥1.2), so every CI run since v0.1.0 failed at `bun install --frozen-lockfile` with `InvalidLockfileVersion`. CI now pins 1.2; `engines.bun` and the README install floor moved to 1.2+ to match what the lockfile already required.
- **fix: the "Losing tool" flag now ranks by lost tasks** — `flagLosingTool` sorted losers by picks, so a 1-loss/50-pick tool could steal the headline from a 3-loss/3-pick tool; it now sorts by losses (ties → picks), matching its documented contract, and the tool table gains a W/L column.
- **fix: runs live at `.repick/runs/<id>.jsonl` as documented** — v0.1.0 wrote `.repick/<id>.jsonl` while `config.ts` documented and `init` scaffolded `runs/`; writes now use the documented layout and reads fall back to the v0.1.0 flat path so existing ledgers keep loading.
- **quality: version lockstep** — `VERSION`, `package.json`, the CLI `--version` string, and `web/site.json` are now tied together (plus the CHANGELOG header) by a regression test.

## [0.1.0] — 2026-09-04

- Initial release: `record` (Claude Code + Codex trace ingest), the JSONL ToolDecision ledger, `ab` outcome-graded comparison with the losing-tool flag, `list`, `init`.
