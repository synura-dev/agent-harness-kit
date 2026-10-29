// Real micro-benchmark. Numbers depend on your machine; run `bun run bench`.
import { LoopDetector, Guardrail, pruneToBudget, type Message } from "../src";

function time(name: string, n: number, fn: (i: number) => void) {
  const t = performance.now();
  for (let i = 0; i < n; i++) fn(i);
  const ms = performance.now() - t;
  console.log(`${name}: ${n} ops in ${ms.toFixed(1)} ms (${((ms * 1000) / n).toFixed(2)} us/op)`);
}

const d = new LoopDetector();
time("LoopDetector.record", 100_000, (i) => d.record({ tool: "t" + (i % 7), args: { a: i % 5 } }));

const g = new Guardrail();
const cmds = ["git push origin main", "rm -rf /", "ls -la", "git push --force", "bun test"];
time("Guardrail.check", 100_000, (i) => g.check(cmds[i % cmds.length]));

const msgs: Message[] = [{ role: "system", content: "s" }, ...Array.from({ length: 1000 }, (_, i) => ({ role: "user" as const, content: "x".repeat(200) + i }))];
time("pruneToBudget(1000 msgs)", 200, () => pruneToBudget(msgs, 8000));
const r = pruneToBudget(msgs, 8000);
console.log(`prune example: ${msgs.length} -> ${r.messages.length} messages, ${r.tokens} est. tokens (budget 8000)`);
