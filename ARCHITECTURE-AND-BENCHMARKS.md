# Architecture & Benchmarks

## Design

Four independent, pure modules in `src/`, no runtime dependencies, no shared state between them. A host harness composes them:

```
tool call -> Guardrail.check(cmd) -> LoopDetector.record(call) -> execute
messages  -> pruneToBudget(messages, budget) -> LLM
task      -> Router.route(task) -> agent + model
```

- Loop detection: key = `tool:stableStringify(args)`; count of that key in the last `windowSize` (20) calls; trips at `maxRepeats` (3).
- Pruning: system messages always kept; remaining messages added newest-first until the budget would be exceeded; order preserved.
- Guardrail: ordered deny rules (regex); optional allow-list. Known limit: regex can be evaded by obfuscation (variables, encoding); use OS-level sandboxing for real isolation.
- Router: static role table, fallback, size-based model upgrade.

## Benchmarks

Only a micro-benchmark exists: `bun run bench` (`bench/bench.ts`) measures per-operation time of loop detection, guardrail checks and pruning on a synthetic 1000-message history. Results vary by machine; none are published here.

Not measured (no claims made): token/cost savings versus other architectures, latency of multi-agent runs, memory footprint, sandbox or injection resistance.

## Roadmap (not implemented)

Hierarchical orchestrator/worker runtime, MCP gateway, prompt-injection sanitizer, cost circuit-breaker, CLI, end-to-end agent evaluations.
