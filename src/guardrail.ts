export interface Rule {
  id: string;
  pattern: RegExp;
  reason: string;
}

export interface Decision {
  allowed: boolean;
  rule?: string;
  reason?: string;
}


export const DEFAULT_DENY: Rule[] = [
  {
    id: "git-force-push",
    pattern: /\bgit\b[^;&|\n]*\bpush\b[^;&|\n]*(?:\s--force(?:-with-lease)?\b|\s-[a-zA-Z]*f[a-zA-Z]*\b|\s\+\S)/,
    reason: "force push can destroy remote history",
  },
  {
    id: "rm-rf",
    pattern: /\brm\s+(?:-[a-zA-Z]*\s+)*-(?:[a-zA-Z]*r[a-zA-Z]*f|[a-zA-Z]*f[a-zA-Z]*r)[a-zA-Z]*\b|\brm\s+(?:-[a-zA-Z]+\s+)*--recursive\b[^;&|\n]*--force/,
    reason: "recursive forced delete",
  },
  { id: "mkfs", pattern: /\bmkfs(?:\.\w+)?\b/, reason: "formats a filesystem" },
  { id: "chmod-777", pattern: /\bchmod\s+(?:-\w+\s+)*0?777\b/, reason: "world-writable permissions" },
  { id: "pipe-to-shell", pattern: /\b(?:curl|wget)\b[^|\n]*\|\s*(?:sudo\s+)?(?:ba|z)?sh\b/, reason: "executes remote script" },
];

export interface GuardrailOptions {
  deny?: Rule[];
  /** If given, a command must match at least one of these (allow-list mode) AND no deny rule. */
  allow?: RegExp[];
}

export class Guardrail {
  private readonly deny: Rule[];
  private readonly allow?: RegExp[];

  constructor(opts: GuardrailOptions = {}) {
    this.deny = opts.deny ?? DEFAULT_DENY;
    this.allow = opts.allow;
  }

  check(command: string): Decision {
    for (const r of this.deny) {
      if (r.pattern.test(command)) return { allowed: false, rule: r.id, reason: r.reason };
    }
    if (this.allow && !this.allow.some((a) => a.test(command))) {
      return { allowed: false, rule: "not-allow-listed", reason: "command not in allow-list" };
    }
    return { allowed: true };
  }
}
