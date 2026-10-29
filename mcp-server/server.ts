import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { Guardrail, LoopDetector, Router, pruneToBudget, type Message } from "../src";

const ROLES = ["system", "user", "assistant", "tool"];

export const TOOLS = [
  {
    name: "check_command",
    description: "Check a shell command against the default deny rules. Returns allowed, rule, reason.",
    inputSchema: {
      type: "object",
      properties: { command: { type: "string", description: "Shell command text" } },
      required: ["command"],
    },
  },
  {
    name: "prune_context",
    description: "Keep system messages plus the newest messages that fit a token budget (heuristic ~4 chars/token).",
    inputSchema: {
      type: "object",
      properties: {
        messages: {
          type: "array",
          items: {
            type: "object",
            properties: { role: { type: "string", enum: ROLES }, content: { type: "string" } },
            required: ["role", "content"],
          },
        },
        budget: { type: "number", description: "Token budget" },
      },
      required: ["messages", "budget"],
    },
  },
  {
    name: "detect_loop",
    description: "Given an ordered list of tool calls, report whether an identical call repeats maxRepeats times.",
    inputSchema: {
      type: "object",
      properties: {
        calls: {
          type: "array",
          items: { type: "object", properties: { tool: { type: "string" }, args: {} }, required: ["tool"] },
        },
        maxRepeats: { type: "number", description: "Default 3, min 2" },
        windowSize: { type: "number", description: "Default 20" },
      },
      required: ["calls"],
    },
  },
  {
    name: "route_task",
    description: "Map a task role and optional size hint to an agent and model.",
    inputSchema: {
      type: "object",
      properties: {
        role: { type: "string", description: "builder, planner, reviewer, scout or verifier" },
        size: { type: "number", description: "Rough size hint; above 100 uses the heavy model" },
      },
      required: ["role"],
    },
  },
];

const router = new Router({
  routes: {
    builder: { agent: "builder", model: "sonnet", heavyModel: "opus" },
    planner: { agent: "planner", model: "sonnet", heavyModel: "opus" },
    reviewer: { agent: "reviewer", model: "sonnet", heavyModel: "opus" },
    scout: { agent: "scout", model: "haiku" },
    verifier: { agent: "verifier", model: "haiku" },
  },
  fallback: { agent: "general", model: "sonnet" },
  heavyThreshold: 100,
});
const guardrail = new Guardrail();

class ArgError extends Error {}
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, name: string, opt = false): number | undefined => {
  if (v === undefined && opt) return undefined;
  if (typeof v !== "number" || !Number.isFinite(v)) throw new ArgError(`${name} must be a finite number`);
  return v;
};

export function callTool(name: string, a: unknown): unknown {
  if (!isObj(a)) throw new ArgError("arguments must be an object");
  switch (name) {
    case "check_command":
      if (typeof a.command !== "string") throw new ArgError("command must be a string");
      return guardrail.check(a.command);
    case "prune_context": {
      const budget = num(a.budget, "budget")!;
      if (!Array.isArray(a.messages)) throw new ArgError("messages must be an array");
      for (const m of a.messages) {
        if (!isObj(m) || !ROLES.includes(m.role as string) || typeof m.content !== "string")
          throw new ArgError("each message needs role (system|user|assistant|tool) and string content");
      }
      return pruneToBudget(a.messages as Message[], budget);
    }
    case "detect_loop": {
      if (!Array.isArray(a.calls)) throw new ArgError("calls must be an array");
      const maxRepeats = num(a.maxRepeats, "maxRepeats", true);
      const windowSize = num(a.windowSize, "windowSize", true);
      let d: LoopDetector;
      try {
        d = new LoopDetector({ maxRepeats, windowSize });
      } catch (e) {
        throw new ArgError((e as Error).message);
      }
      let firstLoopAt = -1;
      a.calls.forEach((c, i) => {
        if (!isObj(c) || typeof c.tool !== "string") throw new ArgError("each call needs a string tool");
        const v = d.record({ tool: c.tool, args: c.args });
        if (v.looping && firstLoopAt < 0) firstLoopAt = i;
      });
      return { looping: firstLoopAt >= 0, firstLoopAt, calls: a.calls.length };
    }
    case "route_task":
      if (typeof a.role !== "string") throw new ArgError("role must be a string");
      return router.route({ role: a.role, size: num(a.size, "size", true) });
    default:
      throw new ArgError(`unknown tool: ${name}`);
  }
}

export function createServer(): Server {
  const server = new Server({ name: "agent-harness-kit", version: "0.1.0" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    try {
      const result = callTool(req.params.name, req.params.arguments ?? {});
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: (e as Error).message }] };
    }
  });
  return server;
}

if (import.meta.main) {
  await createServer().connect(new StdioServerTransport());
}
