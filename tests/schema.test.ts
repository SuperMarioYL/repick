import { test, expect, describe } from "bun:test";
import {
  taskSig,
  ToolDecisionSchema,
  ABReportSchema,
  OPEN_CONFIG,
} from "../src/ingest/schema";

describe("taskSig", () => {
  test("lowercases and slugifies punctuation/whitespace", () => {
    expect(taskSig("Refactor Auth Module")).toBe("refactor-auth-module");
    expect(taskSig("  find   dead code  ")).toBe("find-dead-code");
    expect(taskSig("Rename symbol everywhere.")).toBe("rename-symbol-everywhere");
  });

  test("preserves CJK word chars so non-English tasks still join", () => {
    expect(taskSig("重构 认证 模块")).toBe("重构-认证-模块");
  });

  test("strips leading/trailing dashes", () => {
    expect(taskSig("--- weird spacing ---")).toBe("weird-spacing");
  });
});

describe("ToolDecisionSchema", () => {
  const valid = {
    run_id: "run-A",
    agent: "claude-code",
    task_sig: "refactor-auth-module",
    step_idx: 0,
    tool: "grep",
    arg_summary: "pattern=foo",
    available_tools: ["grep", "ripgrep"],
    outcome: {
      resolved: true,
      secs: 10,
      tokens: 100,
      retried: false,
      fallback: null,
    },
  };

  test("accepts a valid decision", () => {
    expect(ToolDecisionSchema.parse(valid)).toMatchObject({ tool: "grep" });
  });

  test("rejects a negative secs", () => {
    expect(() =>
      ToolDecisionSchema.parse({
        ...valid,
        outcome: { ...valid.outcome, secs: -1 },
      }),
    ).toThrow();
  });

  test("rejects an empty run_id", () => {
    expect(() => ToolDecisionSchema.parse({ ...valid, run_id: "" })).toThrow();
  });
});

describe("ABReportSchema", () => {
  test("accepts an empty per_task list", () => {
    expect(() =>
      ABReportSchema.parse({
        baseline_run: "a",
        candidate_run: "b",
        per_task: [],
      }),
    ).not.toThrow();
  });
});

describe("OPEN_CONFIG", () => {
  test("starts with nothing blocked and no evidence", () => {
    expect(OPEN_CONFIG.blocked).toEqual([]);
    expect(OPEN_CONFIG.allowed).toEqual([]);
    expect(OPEN_CONFIG.evidence).toBeNull();
  });
});
