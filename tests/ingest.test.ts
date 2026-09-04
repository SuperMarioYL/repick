import { test, expect, describe } from "bun:test";
import { ingestClaudeCode } from "../src/ingest/claude_code";
import { ingestCodex } from "../src/ingest/codex";

const claudeTrace = [
  JSON.stringify({
    step: 1,
    task: "Refactor Auth Module",
    tool: "grep",
    args: "pattern=token",
    available: ["grep", "ripgrep", "lsp-symbol"],
    resolved: true,
    secs: 14.5,
    tokens: 520,
    retried: true,
    fallback: "lsp-symbol",
  }),
  JSON.stringify({
    step: 2,
    task: "find dead code",
    tool: "grep",
    args: "pattern=TODO",
    available: ["grep", "ripgrep"],
    resolved: false,
    secs: 9,
    tokens: 200,
    retried: false,
  }),
].join("\n");

describe("ingestClaudeCode", () => {
  test("maps fields to the shared ToolDecision shape", () => {
    const d = ingestClaudeCode("run-A", claudeTrace);
    expect(d).toHaveLength(2);
    expect(d[0]).toMatchObject({
      run_id: "run-A",
      agent: "claude-code",
      task_sig: "refactor-auth-module",
      step_idx: 1,
      tool: "grep",
      arg_summary: "pattern=token",
      available_tools: ["grep", "ripgrep", "lsp-symbol"],
    });
    expect(d[0].outcome).toEqual({
      resolved: true,
      secs: 14.5,
      tokens: 520,
      retried: true,
      fallback: "lsp-symbol",
    });
  });

  test("normalizes task_sig so two runs of the same intent join", () => {
    const d = ingestClaudeCode("run-A", claudeTrace);
    expect(d[0].task_sig).toBe("refactor-auth-module");
    expect(d[1].task_sig).toBe("find-dead-code");
  });

  test("throws on invalid JSON with a line number", () => {
    expect(() => ingestClaudeCode("run-A", "{not json")).toThrow(/invalid JSON/);
  });
});

const codexTrace = JSON.stringify({
  seq: 1,
  intent: "Refactor Auth Module",
  name: "lsp-symbol",
  summary: "rename token",
  tools: ["grep", "ripgrep", "lsp-symbol"],
  ok: true,
  duration_ms: 9000,
  tokens_in: 540,
  retried: false,
});

describe("ingestCodex", () => {
  test("converts codex field names to the shared shape", () => {
    const d = ingestCodex("run-B", codexTrace);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({
      run_id: "run-B",
      agent: "codex",
      task_sig: "refactor-auth-module",
      step_idx: 1,
      tool: "lsp-symbol",
      arg_summary: "rename token",
      available_tools: ["grep", "ripgrep", "lsp-symbol"],
    });
    // duration_ms -> secs, ok -> resolved, tokens_in -> tokens, no fallback -> null
    expect(d[0].outcome).toEqual({
      resolved: true,
      secs: 9,
      tokens: 540,
      retried: false,
      fallback: null,
    });
  });

  test("produces the same task_sig as the claude adapter for the same task", () => {
    const a = ingestClaudeCode("run-A", claudeTrace)[0].task_sig;
    const c = ingestCodex("run-B", codexTrace)[0].task_sig;
    expect(a).toBe(c);
  });
});
