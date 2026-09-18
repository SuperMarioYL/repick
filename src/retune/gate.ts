import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest,
  type CallToolResult,
  type ListToolsResult,
} from "@modelcontextprotocol/sdk/types.js";
import type { ToolAvailabilityConfig } from "../ingest/schema";
import { readActiveConfig, retuneConfigPath } from "./config";

/**
 * MCP gating server (m2).
 *
 * Spawned by the agent on demand over the standard MCP stdio contract (we run
 * no daemon). It answers whether a tool is available under the active
 * ToolAvailabilityConfig, with the evidence that justified the verdict — so
 * the agent consults the gate before reaching for a tool, and `record` stamps
 * the same affordance set onto the run for the before/after delta.
 */

export type GateVerdict = {
  tool: string;
  allowed: boolean;
  blocked_by: string | null;
  evidence: string | null;
};

/** Pure gate decision for one tool under one config. */
export function checkTool(
  config: ToolAvailabilityConfig,
  tool: string,
): GateVerdict {
  const blockedBy = config.blocked.find(
    (b) => b === tool || b.startsWith(`${tool}:`) || b.startsWith(`${tool}(`),
  );
  return {
    tool,
    allowed: blockedBy === undefined,
    blocked_by: blockedBy ?? null,
    evidence: config.evidence,
  };
}

/** The tools the gate exposes, in MCP tool-descriptor form. */
export function gateToolDescriptors(): ListToolsResult["tools"] {
  return [
    {
      name: "check_tool",
      description:
        "Ask whether a tool is available under the active repick ToolAvailabilityConfig; a denial carries the evidence pointer that justified the block.",
      inputSchema: {
        type: "object" as const,
        properties: { tool: { type: "string", description: "the tool name the agent is about to use" } },
        required: ["tool"],
      },
    },
    {
      name: "list_availability",
      description: "Return the active ToolAvailabilityConfig (allowed, blocked, evidence).",
      inputSchema: { type: "object" as const, properties: {} },
    },
  ];
}

/** Pure tool-call handler: (config, tool name, args) -> MCP CallToolResult. */
export function handleGateCall(
  config: ToolAvailabilityConfig,
  name: string,
  args: Record<string, unknown>,
): CallToolResult {
  const text = (payload: unknown): CallToolResult => ({
    content: [{ type: "text", text: JSON.stringify(payload) }],
  });
  if (name === "check_tool") {
    const tool = typeof args.tool === "string" ? args.tool : "";
    if (!tool) {
      return { content: [{ type: "text", text: "check_tool requires a tool name" }], isError: true };
    }
    return text(checkTool(config, tool));
  }
  if (name === "list_availability") {
    return text(config);
  }
  return { content: [{ type: "text", text: `unknown tool: ${name}` }], isError: true };
}

/** Build the MCP server exposing the gate (check_tool + list_availability). */
export function createGateServer(config: ToolAvailabilityConfig): Server {
  const server = new Server(
    { name: "repick-gate", version: "0.2.0" },
    {
      instructions:
        "repick gate: consult before tool use. check_tool answers allow/deny with the A/B evidence that justified it; list_availability returns the active ToolAvailabilityConfig.",
      capabilities: { tools: {} },
    },
  );
  server.setRequestHandler(ListToolsRequestSchema, async (): Promise<ListToolsResult> => ({
    tools: gateToolDescriptors(),
  }));
  server.setRequestHandler(
    CallToolRequestSchema,
    async (request: CallToolRequest): Promise<CallToolResult> =>
      handleGateCall(config, request.params.name, request.params.arguments ?? {}),
  );
  return server;
}

/** Entry point for `repick gate`: read the active config and serve stdio. */
export async function startGate(ledgerDir: string): Promise<void> {
  const config = await readActiveConfig(ledgerDir);
  if (!config) {
    throw new Error(
      `repick gate: no active ToolAvailabilityConfig at ${retuneConfigPath(ledgerDir)} — run \`repick retune <baseline> <candidate>\` first.`,
    );
  }
  const server = createGateServer(config);
  await server.connect(new StdioServerTransport());
}
