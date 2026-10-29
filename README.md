# Agent Harness Kit

Small Bun + TypeScript toolkit with four building blocks for LLM agent harnesses. The core in `src/` has zero runtime dependencies; the optional `mcp-server/` subfolder depends on the MCP SDK. Every module has unit tests (`bun test`).

## Modules (implemented)

| Module | File | What it does |
| :--- | :--- | :--- |
| Loop detection | `src/loop-detector.ts` | `LoopDetector` hashes `tool + args` (key-order independent) over a sliding window; flags when the same call repeats `maxRepeats` times (default 3). |
| Token budget pruning | `src/token-budget.ts` | `pruneToBudget` keeps all system messages plus the newest contiguous tail that fits a token budget. Token count is a ~4 chars/token heuristic unless you pass your own counter. |
| Execution guardrail | `src/guardrail.ts` | `Guardrail` denies shell commands by regex rules (force push, `rm -rf`, `mkfs`, `chmod 777`, `curl \| sh`) and optionally enforces an allow-list. Regex based: a best-effort filter, not a sandbox. |
| Subagent router | `src/router.ts` | `Router` maps a task role to an agent + model, with a fallback route and optional heavy-model upgrade by size hint. |

## Quickstart

```bash
git clone https://github.com/synura-dev/agent-harness-kit.git
cd agent-harness-kit
bun test         # unit tests
bun run bench    # micro-benchmark on your machine
```

```ts
import { LoopDetector, Guardrail, Router, pruneToBudget } from "./src";

const loop = new LoopDetector({ maxRepeats: 3 });
loop.record({ tool: "read", args: { path: "a.ts" } }).looping; // true on 3rd identical call

new Guardrail().check("git push --force"); // { allowed: false, rule: "git-force-push", ... }

const { messages } = pruneToBudget(history, 8000);

const router = new Router({
  routes: { builder: { agent: "builder", model: "sonnet", heavyModel: "opus" } },
  fallback: { agent: "general", model: "sonnet" },
  heavyThreshold: 100,
});
router.route({ role: "builder", size: 500 }); // { agent: "builder", model: "opus", matched: true }
```

## MCP server

`mcp-server/` is a stdio MCP server that exposes the four core modules as tools. It is a plain server, not a gateway or proxy: it does not sit in front of other MCP servers. It has its own `package.json` (pinned `@modelcontextprotocol/sdk` 1.32.2); the core stays dependency-free.

```bash
cd mcp-server
bun install
bun run server.ts   # speaks MCP over stdin/stdout
bun test            # spawns the server over stdio and exercises every tool
```

Client config example:

```json
{ "mcpServers": { "agent-harness-kit": { "command": "bun", "args": ["run", "/path/to/agent-harness-kit/mcp-server/server.ts"] } } }
```

| Tool | Input | Output |
| :--- | :--- | :--- |
| `check_command` | `command` | `allowed`, matching `rule`, `reason` (default deny rules) |
| `prune_context` | `messages`, `budget` | pruned `messages`, heuristic `tokens`, `dropped` |
| `detect_loop` | `calls` (+ optional `maxRepeats`, `windowSize`) | `looping`, `firstLoopAt` |
| `route_task` | `role`, optional `size` | `agent`, `model`, `matched` (built-in example routes) |

Invalid arguments return an MCP tool error (`isError`), not a crash.

## Roadmap (not implemented)

Orchestrator/worker runtime, prompt-injection sanitizer, cost circuit-breaker, CLI. See `ARCHITECTURE-AND-BENCHMARKS.md`.

## License

MIT (c) Huynh Tien Phat
