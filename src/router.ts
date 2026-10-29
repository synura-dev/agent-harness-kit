export interface Task {
  role: string;
  /** Rough size hint; tasks above `heavyThreshold` use the route's heavy model if defined. */
  size?: number;
}

export interface Route {
  agent: string;
  model: string;
  heavyModel?: string;
}

export interface RouterOptions {
  routes: Record<string, Route>;
  fallback: Route;
  heavyThreshold?: number;
}

export interface Routed {
  agent: string;
  model: string;
  matched: boolean;
}

export class Router {
  constructor(private readonly opts: RouterOptions) {}

  route(task: Task): Routed {
    const r = this.opts.routes[task.role];
    const base = r ?? this.opts.fallback;
    const heavy = (task.size ?? 0) > (this.opts.heavyThreshold ?? Infinity);
    return {
      agent: base.agent,
      model: heavy && base.heavyModel ? base.heavyModel : base.model,
      matched: !!r,
    };
  }
}
