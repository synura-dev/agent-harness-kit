export interface ToolCall {
  tool: string;
  args?: unknown;
}

export interface LoopDetectorOptions {
  /** A call seen this many times within the window trips the detector. Default 3. */
  maxRepeats?: number;
  /** Number of most recent calls kept. Default 20. */
  windowSize?: number;
}

export interface LoopVerdict {
  looping: boolean;
  count: number;
  key: string;
}

/** Stable JSON: object keys sorted so {a,b} and {b,a} hash identically. */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "undefined";
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(",")}}`;
}

export class LoopDetector {
  private readonly maxRepeats: number;
  private readonly windowSize: number;
  private history: string[] = [];

  constructor(opts: LoopDetectorOptions = {}) {
    this.maxRepeats = opts.maxRepeats ?? 3;
    this.windowSize = opts.windowSize ?? 20;
    if (this.maxRepeats < 2) throw new RangeError("maxRepeats must be >= 2");
    if (this.windowSize < this.maxRepeats) throw new RangeError("windowSize must be >= maxRepeats");
  }

  /** Record a call and report whether identical (tool+args) calls reached the threshold in the window. */
  record(call: ToolCall): LoopVerdict {
    const key = `${call.tool}:${stableStringify(call.args)}`;
    this.history.push(key);
    if (this.history.length > this.windowSize) this.history.shift();
    const count = this.history.filter((k) => k === key).length;
    return { looping: count >= this.maxRepeats, count, key };
  }

  reset(): void {
    this.history = [];
  }
}
