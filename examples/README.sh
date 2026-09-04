# example workflow — record two agent runs and compare them
#
# This reproduces the A/B table shown in the README Demo section.
# Run from a clone of this repo:

repick init
repick record run-A --agent claude --trace examples/claude-code-trace.jsonl
repick record run-B --agent codex  --trace examples/codex-trace.jsonl
repick ab run-A run-B --verbose
