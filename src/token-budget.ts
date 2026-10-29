export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

/** Cheap heuristic estimate (~4 chars per token). Not a real tokenizer; pass your own counter for accuracy. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4) + 4; // +4 per-message overhead
}

export interface PruneResult {
  messages: Message[];
  tokens: number;
  dropped: number;
}

/**
 * Keep all system messages, then add the most recent other messages (newest first)
 * while they fit in `budget`. Original order is preserved. System messages are always
 * kept even if they alone exceed the budget.
 */
export function pruneToBudget(
  messages: Message[],
  budget: number,
  count: (m: Message) => number = (m) => estimateTokens(m.content),
): PruneResult {
  const keep = new Set<number>();
  let used = 0;
  messages.forEach((m, i) => {
    if (m.role === "system") {
      keep.add(i);
      used += count(m);
    }
  });
  for (let i = messages.length - 1; i >= 0; i--) {
    if (keep.has(i)) continue;
    const c = count(messages[i]);
    if (used + c > budget) break; // stop at first miss: keep a contiguous recent tail
    keep.add(i);
    used += c;
  }
  const out = messages.filter((_, i) => keep.has(i));
  return { messages: out, tokens: used, dropped: messages.length - out.length };
}
