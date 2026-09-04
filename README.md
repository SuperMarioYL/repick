<div align="right"><sub><b>EN</b>&nbsp;&nbsp;⇄&nbsp;&nbsp;<a href="./README.zh-CN.md">中文</a></sub></div>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/hero-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="./assets/hero-light.svg">
    <img src="./assets/hero-light.svg" width="880" alt="repick — tool-choice empirical replay for coding agents">
  </picture>
</p>

<p align="center"><sub>The replay layer that A/B-compares and retunes agent tool picks for devs.</sub></p>

<p align="center">
  <a href="./LICENSE"><img alt="license" src="https://img.shields.io/badge/license-MIT-blue"></a>
  <img alt="release" src="https://img.shields.io/github/v/release/SuperMarioYL/repick">
  <img alt="ci" src="https://img.shields.io/github/actions/workflow/status/SuperMarioYL/repick/ci.yml?branch=main&label=ci">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.5-3178c6?logo=typescript&logoColor=white">
  <img alt="Bun" src="https://img.shields.io/badge/Bun-1.1-000?logo=bun">
</p>

**repick records every tool-selection decision your coding agent makes alongside its observable outcome, diffs runs A/B, and hands you a retune knob grounded in evidence — not vibes.**

<h2><img src="https://api.iconify.design/tabler:topology-star-3.svg?color=%230071E3&width=24" height="22" align="absmiddle" alt=""> Architecture</h2>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/atlas-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="./assets/atlas-light.svg">
    <img src="./assets/atlas-light.svg" width="880" alt="repick architecture: agent trace → ingest adapters → ToolDecision ledger → A/B replay → outcome table">
  </picture>
</p>

The new primitive is the **ToolDecision** — a tool-selection moment lifted out of the trace and joined to its observable outcome, making tool-choice a first-class comparable unit instead of an invisible side effect of the run. Per-agent ingest adapters hide Claude Code's and Codex's different trace-field naming behind one normalized shape; the A/B engine joins decisions across two runs by `task_sig` (a stable task fingerprint) and diffs per-tool outcomes.

## Table of contents

- [Why this exists](#why-this-exists)
- [Install](#install)
- [Quickstart](#quickstart)
- [Usage](#usage)
- [Demo](#demo)
- [Roadmap](#roadmap)
- [License](#license)

## Why this exists

Coding agents now pick among several tools per sub-task — grep, LSP, file editors, browsers — and there is no record tying each tool-selection decision to the observable outcome of that sub-task. An engineer watches their agent reach for grep and ignore the project's LSP, suspects that was the wrong call, but has no per-choice outcome ledger and no knob to turn grep off on the next run. repick makes tool-selection a steerable flow primitive: observe the outcome, A/B compare runs, then retune tool availability from the evidence.

## Install

repick runs on [Bun](https://bun.sh) 1.1+.

```bash
curl -fsSL https://bun.sh/install | bash   # if you don't have bun yet
git clone https://github.com/SuperMarioYL/repick.git
cd repick && bun install
```

Once published, `bunx repick` works globally. For a local clone, invoke `bun src/cli.ts` (or `bun link` to put `repick` on your PATH).

## Quickstart

From a fresh clone to the A/B table in three commands. (`repick init` is optional — `record` auto-scaffolds the `.repick/` ledger.)

```bash
bun src/cli.ts record run-A --agent claude --trace examples/claude-code-trace.jsonl
bun src/cli.ts record run-B --agent codex  --trace examples/codex-trace.jsonl
bun src/cli.ts ab run-A run-B
```

<details><summary>sample output</summary>

```
repick ab — run-A vs run-B

| tool | run | picks | resolved | avg-secs | tokens | verdict | retune hint |
| --- | --- | --- | --- | --- | --- | --- | --- |
| grep | run-A | 3 | 2 | 24.3 | 3320 | loser | block grep (lost 3 tasks) |
| lsp-symbol | run-B | 2 | 2 | 7.5 | 840 | winner | — |
| ripgrep | run-B | 1 | 1 | 7 | 360 | winner | — |

Losing tool: grep (run-A) — block grep (lost 3 tasks)
```
</details>

<h2><img src="https://api.iconify.design/tabler:terminal-2.svg?color=%230071E3&width=24" height="22" align="absmiddle" alt=""> Usage</h2>

repick is a three-verb surface: `record`, `ab`, and (in m2) `retune`. Every step is under a minute of user effort.

```bash
# scaffold the .repick/ ledger (optional — record does this on demand)
repick init

# ingest an exported agent trace as a stream of ToolDecisions
# --agent picks the ingest adapter; --trace - reads from stdin
repick record run-A --agent claude --trace path/to/trace.jsonl
repick record run-B --agent codex  --trace path/to/trace.jsonl

# compare two runs; -v appends the per-task diff
repick ab run-A run-B --verbose

# list what's in the ledger
repick list
```

A trace is one JSON object per line. Claude Code and Codex use different field names (the chaos the adapters hide); either way the adapter normalizes to a `ToolDecision`. See `examples/` for sample traces in each format. v0.1 ingests **exported** traces (post-hoc replay only) — live wrapping of the agent is a follow-on.

<h2><img src="https://api.iconify.design/tabler:photo.svg?color=%230071E3&width=24" height="22" align="absmiddle" alt=""> Demo</h2>

The hero artifact is the A/B outcome table itself. Here `run-A` (Claude Code, grep-heavy) is compared against `run-B` (Codex, ripgrep + LSP) across the same three refactor tasks:

| tool | run | picks | resolved | avg-secs | tokens | verdict | retune hint |
| --- | --- | --- | --- | --- | --- | --- | --- |
| grep | run-A | 3 | 2 | 24.3 | 3320 | loser | block grep (lost 3 tasks) |
| lsp-symbol | run-B | 2 | 2 | 7.5 | 840 | winner | — |
| ripgrep | run-B | 1 | 1 | 7 | 360 | winner | — |

```
Losing tool: grep (run-A) — block grep (lost 3 tasks)
```

repick flagged grep: across all three tasks the agent reached for grep first, and the run that reached for ripgrep + LSP resolved faster on every one. That is the "grep beats LSP, can't steer it" pain made measurable on your own traces. Reproduce it with the Quickstart commands above (reproducible vhs script in `docs/demo.tape`).

<h2><img src="https://api.iconify.design/tabler:map-2.svg?color=%230071E3&width=24" height="22" align="absmiddle" alt=""> Roadmap</h2>

- [x] **m1 — record + A/B table** · ingest adapters (Claude Code + Codex), the JSONL ledger, the `task_sig` A/B join, a pretty CLI table that flags the losing tool. *(this release)*
- [ ] **m2 — retune loop** · `repick retune` emits a `ToolAvailabilityConfig` from A/B verdicts, and an MCP gating server (spawned on demand via stdio, not a daemon) respects it so the next run genuinely cannot reach the blocked tool. `ab` gains a before/after delta row.
- [ ] **m3 — cross-vendor** *(stretch)* · Cursor adapter, cross-agent `task_sig` normalization so the same task compares across Claude Code / Codex / Cursor, and a dashboard export.

Out of scope for v0.1: web UI / hosted dashboard, auto-rewriting agent prompts, learned tool-selection policies, real-time live steering, telemetry upload, and token-cost recommendations.

<h2><img src="https://api.iconify.design/tabler:license.svg?color=%230071E3&width=24" height="22" align="absmiddle" alt=""> License</h2>

MIT — see [LICENSE](./LICENSE). Free OSS; no accounts, no cloud, no paywalled features. File an issue or open a PR at [github.com/SuperMarioYL/repick](https://github.com/SuperMarioYL/repick); the issue template is "paste your `repick ab` table."

<p align="center"><sub><a href="./LICENSE">MIT</a> © 2026 SuperMarioYL</sub></p>
