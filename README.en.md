**English** | [简体中文](README.md)

<picture>
  <source media="(max-width: 640px) and (prefers-color-scheme: dark)" srcset="assets/presentation/hero-mobile-dark.svg">
  <source media="(max-width: 640px)" srcset="assets/presentation/hero-mobile-light.svg">
  <source media="(prefers-color-scheme: dark)" srcset="assets/presentation/hero-dark.svg">
  <img src="assets/presentation/hero-light.svg" width="880" alt="repick particle identity: compare tool choices and see the outcome.">
</picture>

**repick turns exported coding-agent traces into task-aligned A/B tables, so you can see how tool choices and recorded outcomes differ between runs.**

`v0.1.0` · `Bun ≥ 1.1` · `TypeScript` · [MIT](LICENSE)

[Why](#why-repick) · [Architecture](#architecture) · [Install](#install) · [Quickstart](#quickstart) · [Usage](#usage) · [Demo](#demo) · [Integration](#integration-and-configuration) · [Roadmap](#roadmap)

## Why repick

After changing an agent's tool set, the success of the whole run may leave important questions unanswered. For the same subtask, which tool did each run reach for first? Was the task resolved, how long did it take, and did the run retry or fall back to another tool?

repick extracts those records from exported traces and puts matching tasks side by side. Check the outcome first, compare the recorded duration, then inspect the per-task differences. The report supports further investigation. You choose how to adjust the next run's tool settings.

The illustration below uses the two synthetic traces shipped with the repository. Its durations and the token counts shown later are input fields, not agent-performance measurements from this execution. They do not establish that one tool is generally better than another.

<picture>
  <source media="(max-width: 640px) and (prefers-color-scheme: dark)" srcset="assets/presentation/process-mobile-dark.svg">
  <source media="(max-width: 640px)" srcset="assets/presentation/process-mobile-light.svg">
  <source media="(prefers-color-scheme: dark)" srcset="assets/presentation/process-dark.svg">
  <img src="assets/presentation/process-light.svg" width="880" alt="Two sample traces are paired by task to compare grep and candidate tools using resolution status and input durations.">
</picture>

## Architecture

<picture>
  <source media="(max-width: 640px) and (prefers-color-scheme: dark)" srcset="assets/presentation/architecture-mobile-dark.svg">
  <source media="(max-width: 640px)" srcset="assets/presentation/architecture-mobile-light.svg">
  <source media="(prefers-color-scheme: dark)" srcset="assets/presentation/architecture-dark.svg">
  <img src="assets/presentation/architecture-light.svg" width="880" alt="Two ingest adapters normalize traces into ToolDecision records, store a local JSONL ledger, and feed the A/B engine that produces Markdown reports.">
</picture>

Two ingest adapters normalize different field names into a `ToolDecision`: the task signature, chosen tool, available tools, and an outcome containing resolution status, duration, tokens, retries and fallback. The CLI appends each run to a local JSONL file. The comparison engine reads two runs, joins their `task_sig` values, and emits Markdown tables.

The implementation lives in the [ingest layer](src/ingest/), [data model](src/ingest/schema.ts), [local ledger](src/ledger/store.ts), and [A/B engine](src/replay/ab.ts). `task_sig` normalizes case, whitespace and punctuation. It does not infer whether differently worded descriptions mean the same task.

## Install

Requires Bun 1.1 or newer. Check the installed runtime with `bun --version`.

```bash
git clone https://github.com/SuperMarioYL/repick.git
cd repick
bun install
```

From a source checkout, invoke `bun src/cli.ts`. The offline example below does not start an agent or call a model API; installing dependencies requires network access.

## Quickstart

In a fresh clone, import the supplied [Claude-format trace](examples/claude-code-trace.jsonl) and [Codex-format trace](examples/codex-trace.jsonl), then compare them:

```bash
bun src/cli.ts record run-A --agent claude --trace examples/claude-code-trace.jsonl
bun src/cli.ts record run-B --agent codex --trace examples/codex-trace.jsonl
bun src/cli.ts ab run-A run-B
```

Each input has three decisions with matching task descriptions. The output includes:

```text
Losing tool: grep (run-A) — block grep (lost 3 tasks)
```

`block grep` is a suggestion in the report. The current version does not disable the tool. `record` creates the ledger automatically, so `init` is optional. Recording the same run ID appends decisions; use new IDs for another experiment to avoid merging repeated imports.

## Usage

```bash
# List imported run IDs
bun src/cli.ts list

# Inspect the differences for every matched task
bun src/cli.ts ab run-A run-B --verbose
```

The `record` command uses `--agent` to select the input format: `claude` / `claude-code` or `codex`. Pass a JSONL file to `--trace`, or use `-` to read standard input. The optional `init` command only creates local directories. The main operations in v0.1.0 are `record`, `ab` and `list`.

## Demo

This tool summary came from the same local execution. Each row groups tasks by run and the first tool recorded for the task. `picks` counts those tasks. For a task with several steps, durations and token counts are summed before the tool summary is computed.

| tool | run | picks | resolved | avg-secs | tokens | verdict | retune hint |
| --- | --- | --- | --- | --- | --- | --- | --- |
| grep | run-A | 3 | 2 | 24.3 | 3320 | loser | block grep (lost 3 tasks) |
| lsp-symbol | run-B | 2 | 2 | 7.5 | 840 | winner | — |
| ripgrep | run-B | 1 | 1 | 7 | 360 | winner | — |

With `--verbose`, the report also shows which tasks produced those conclusions:

| task_sig | baseline | candidate | Δsecs | Δresolved | verdict | retune hint |
| --- | --- | --- | --- | --- | --- | --- |
| find-dead-code | grep | ripgrep | -24 | +1 | candidate-wins | block grep on find-dead-code |
| refactor-auth-module | grep | lsp-symbol | -15 | 0 | candidate-wins | block grep on refactor-auth-module |
| rename-symbol-everywhere | grep | lsp-symbol | -12 | 0 | candidate-wins | block grep on rename-symbol-everywhere |

[Complete commands and output](docs/demo-results.json) · [Replayable command script](docs/demo.sh) · [Text transcript](docs/demo-output.txt)

### Comparison rules

1. Only task signatures present in both runs receive a per-task verdict. Unmatched tasks may still appear in their own run's tool summary.
2. For a task with multiple steps, the first decision in input order represents the tool choice. Any resolved step makes the task resolved; durations and tokens are summed.
3. If only one side resolves the task, it wins. If both resolve it, the faster side wins unless the gap is within 5% of the larger duration. If neither resolves it, the result is `inconclusive`.
4. Per-tool verdicts summarize task wins and losses. Use the report to identify choices worth reviewing; it does not turn an observed association into a causal claim about tool effectiveness.

## Capabilities and responsibilities

<picture>
  <source media="(max-width: 640px) and (prefers-color-scheme: dark)" srcset="assets/presentation/integrations-mobile-dark.svg">
  <source media="(max-width: 640px)" srcset="assets/presentation/integrations-mobile-light.svg">
  <source media="(prefers-color-scheme: dark)" srcset="assets/presentation/integrations-dark.svg">
  <img src="assets/presentation/integrations-light.svg" width="880" alt="Implemented repick v0.1.0 routes: two trace schemas, standard input, a local ledger, tool tables and per-task differences.">
</picture>

| Stage | What v0.1.0 does | What you provide |
|---|---|---|
| Ingest traces | Read and validate the two JSONL formats defined by the examples | Tool events and outcomes exported to the corresponding schema |
| Save runs | Append `ToolDecision` records to `.repick/<runId>.jsonl` | Run IDs that distinguish experiments |
| Compare A/B | Match tasks, aggregate outcomes and produce tool and task tables | Comparable task descriptions and consistent metric definitions |
| Act on results | Emit a text `retune hint` | Human review and changes to tool settings outside repick |

These adapters accept this project's export schemas. They are not live agent connections and do not promise to import arbitrary native history logs. `retune` and `gate` currently print roadmap messages only.

## Integration and configuration

The current version requires no configuration file or API key. The ledger location follows the command's working directory, so import and compare from the same project directory. Prepare one JSON object per line, using the examples as the input contract:

| Meaning | Claude format | Codex format | Normalized field |
|---|---|---|---|
| Task | `task` | `intent` | `task_sig` |
| Step | `step` | `seq` | `step_idx` |
| Tool | `tool` | `name` | `tool` |
| Argument summary | `args` | `summary` | `arg_summary` |
| Available tools | `available` | `tools` | `available_tools` |
| Resolved | `resolved` | `ok` | `outcome.resolved` |
| Duration | `secs` | `duration_ms` | Seconds; divide the latter by 1000 |
| Tokens | `tokens` | `tokens_in` | `outcome.tokens` |

`retried` and optional `fallback` are retained as well. The trace producer must align measurement definitions, particularly the meaning of `tokens` versus `tokens_in`. repick maps fields; it does not reconcile metric semantics across sources. Task descriptions pair only when their normalized text matches.

For development, run `bun test` and `bun run typecheck`. See the [schema](src/ingest/schema.ts) for input contracts and the [A/B engine](src/replay/ab.ts) for verdict logic.

## Roadmap

| Status | Scope |
|---|---|
| Implemented · m1 | Two exported-trace formats, JSONL ledger, task-aligned A/B comparison, tool summaries and task differences |
| Planned · m2 | Generate `ToolAvailabilityConfig` from reports and enforce tool availability through an on-demand MCP gate |
| Exploratory · m3 | Cursor ingest, alignment across differently worded tasks, and dashboard export |

The current version does not include a hosted dashboard, live agent wrapping, automatic prompt rewriting or a learned tool-selection policy.

## License

[MIT](LICENSE) © 2026 SuperMarioYL · [Source and issues](https://github.com/SuperMarioYL/repick)
