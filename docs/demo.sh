#!/usr/bin/env bash
set -euo pipefail
# Run once from a fresh repick checkout; record appends to existing run IDs.
bun src/cli.ts record run-A --agent claude --trace examples/claude-code-trace.jsonl
bun src/cli.ts record run-B --agent codex --trace examples/codex-trace.jsonl
bun src/cli.ts ab run-A run-B
bun src/cli.ts ab run-A run-B --verbose
bun src/cli.ts list
