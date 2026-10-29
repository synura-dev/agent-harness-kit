import { afterAll, beforeAll, describe, expect, test } from "bun:test";

let proc: ReturnType<typeof Bun.spawn>;
let buf = "";
let id = 0;
const waiters = new Map<number, (m: any) => void>();

async function pump() {
  const dec = new TextDecoder();
  for await (const chunk of proc.stdout as ReadableStream<Uint8Array>) {
    buf += dec.decode(chunk);
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      const m = JSON.parse(line);
      waiters.get(m.id)?.(m);
    }
  }
}

function send(msg: unknown) {
  (proc.stdin as any).write(JSON.stringify(msg) + "\n");
  (proc.stdin as any).flush?.();
}

function rpc(method: string, params: unknown = {}): Promise<any> {
  const myId = ++id;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout ${method}`)), 8000);
    waiters.set(myId, (m) => {
      clearTimeout(t);
      resolve(m);
    });
    send({ jsonrpc: "2.0", id: myId, method, params });
  });
}

const call = async (name: string, args: unknown) => {
  const r = await rpc("tools/call", { name, arguments: args });
  return { ...r.result, data: r.result?.isError ? null : JSON.parse(r.result.content[0].text) };
};

beforeAll(async () => {
  proc = Bun.spawn([process.execPath, "run", `${import.meta.dir}/server.ts`], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "ignore",
  });
  void pump();
  const r = await rpc("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "test", version: "0" },
  });
  expect(r.result.serverInfo.name).toBe("agent-harness-kit");
  send({ jsonrpc: "2.0", method: "notifications/initialized" });
}, 15000);

afterAll(() => {
  proc?.kill();
});

describe("mcp server (stdio)", () => {
  test("tools/list exposes the four tools", async () => {
    const r = await rpc("tools/list");
    expect(r.result.tools.map((t: any) => t.name).sort()).toEqual([
      "check_command",
      "detect_loop",
      "prune_context",
      "route_task",
    ]);
    for (const t of r.result.tools) expect(t.inputSchema.type).toBe("object");
  }, 10000);

  test("check_command denies and allows", async () => {
    const d = await call("check_command", { command: "git push --" + "force" });
    expect(d.data.allowed).toBe(false);
    expect(d.data.rule).toBe("git-force-push");
    expect((await call("check_command", { command: "ls -la" })).data.allowed).toBe(true);
  }, 10000);

  test("prune_context keeps system and newest within budget", async () => {
    const messages = [
      { role: "system", content: "sys" },
      { role: "user", content: "a".repeat(400) },
      { role: "user", content: "recent" },
    ];
    const r = await call("prune_context", { messages, budget: 30 });
    expect(r.data.messages.map((m: any) => m.content)).toEqual(["sys", "recent"]);
    expect(r.data.dropped).toBe(1);
    expect(r.data.tokens).toBeGreaterThan(0);
  }, 10000);

  test("detect_loop flags repeats, ignores key order", async () => {
    const c = { tool: "read", args: { a: 1, b: 2 } };
    const yes = await call("detect_loop", { calls: [c, { tool: "read", args: { b: 2, a: 1 } }, c] });
    expect(yes.data.looping).toBe(true);
    expect(yes.data.firstLoopAt).toBe(2);
    const no = await call("detect_loop", { calls: [c, { tool: "write" }, c] });
    expect(no.data.looping).toBe(false);
  }, 10000);

  test("route_task maps role, size and fallback", async () => {
    expect((await call("route_task", { role: "builder" })).data).toEqual({ agent: "builder", model: "sonnet", matched: true });
    expect((await call("route_task", { role: "builder", size: 500 })).data.model).toBe("opus");
    expect((await call("route_task", { role: "nope" })).data).toEqual({ agent: "general", model: "sonnet", matched: false });
  }, 10000);

  test("bad arguments return isError, server stays alive", async () => {
    expect((await call("check_command", { command: 5 })).isError).toBe(true);
    expect((await call("prune_context", { messages: "x", budget: 1 })).isError).toBe(true);
    expect((await call("prune_context", { messages: [{ role: "bad", content: "x" }], budget: 1 })).isError).toBe(true);
    expect((await call("detect_loop", { calls: [{}] })).isError).toBe(true);
    expect((await call("detect_loop", { calls: [], maxRepeats: 1 })).isError).toBe(true);
    expect((await call("route_task", { role: "x", size: "big" })).isError).toBe(true);
    expect((await call("nope", {})).isError).toBe(true);
    expect((await call("route_task", { role: "scout" })).data.model).toBe("haiku");
  }, 10000);
});
