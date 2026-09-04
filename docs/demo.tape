# vhs tape — the 10-minute happy path: record two runs, ab them.
# Render with: vhs docs/demo.tape  (writes assets/demo.gif)
# Re-run on demand via the `demo` workflow (manual only).

Output assets/demo.gif

Set FontSize 14
Set Width 1000
Set Height 520
Set Theme "Dracula"

Type "bun src/cli.ts record run-A --agent claude --trace examples/claude-code-trace.jsonl"
Enter
Sleep 2

Type "bun src/cli.ts record run-B --agent codex --trace examples/codex-trace.jsonl"
Enter
Sleep 2

Type "bun src/cli.ts ab run-A run-B --verbose"
Enter
Sleep 3
