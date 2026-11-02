import { SettingsSchema } from "@job-copilot/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { cacheKey, canonicalJson } from "@/lib/ai/cache";
import {
  ProviderError,
  type ChatClient,
  type CompletionRequest,
  type ProviderConfig,
} from "@/lib/ai/providers";
import {
  AiNotConfiguredError,
  AiValidationError,
  extractJson,
  runTask,
  type AiRuntime,
  type AiTask,
} from "@/lib/ai/runner";
import { AiBudgetError, AiScheduler, memoryUsageStore } from "@/lib/ai/scheduler";
import { JobCopilotDB } from "@/lib/db/db";

type Reply = string | ProviderError;

/** A scripted OpenAI-compatible client that records every request. */
class FakeClient implements ChatClient {
  requests: CompletionRequest[] = [];
  constructor(private replies: Reply[]) {}
  complete(request: CompletionRequest): Promise<string> {
    this.requests.push(request);
    const reply = this.replies.shift();
    if (reply === undefined) return Promise.reject(new Error("no scripted reply"));
    return reply instanceof ProviderError ? Promise.reject(reply) : Promise.resolve(reply);
  }
  listModels() {
    return Promise.resolve(["model-a"]);
  }
}

const task: AiTask<{ text: string }, { summary: string; count: number }> = {
  id: "testTask",
  promptVersion: 1,
  schema: z.object({ summary: z.string(), count: z.number().int() }),
  buildMessages: (input) => [{ role: "user", content: `<data>${input.text}</data>` }],
  cacheTtlMs: null,
  redactInput: true,
  priority: "user",
};

let n = 0;
let clock: number;
let sleeps: number[];
let clients: Map<string, FakeClient>;
let rt: AiRuntime;

function runtime(replies: Record<string, Reply[]>, overrides: Partial<AiRuntime> = {}): AiRuntime {
  clients = new Map(Object.entries(replies).map(([p, r]) => [p, new FakeClient(r)]));
  clock = Date.parse("2026-11-02T06:00:00Z");
  sleeps = [];
  const sleep = (ms: number) => {
    sleeps.push(ms);
    clock += ms;
    return Promise.resolve();
  };
  return {
    db: new JobCopilotDB(`ai-${String(++n)}`),
    scheduler: new AiScheduler({
      requestsPerMinute: 60,
      dailyBudget: 100,
      usage: memoryUsageStore(),
      now: () => clock,
      sleep,
    }),
    ai: SettingsSchema.parse({}).ai,
    keys: { gemini: "key-1", groq: "key-2" },
    redact: true,
    identity: { fullName: "Priya Sharma" },
    clientFor: (config: ProviderConfig) => {
      const client = clients.get(config.provider);
      if (!client) throw new Error(`no client for ${config.provider}`);
      return client;
    },
    now: () => new Date(clock),
    sleep,
    ...overrides,
  };
}

beforeEach(() => {
  rt = runtime({ gemini: ['{"summary":"ok","count":1}'] });
});

describe("runTask", () => {
  it("validates the answer and caches it", async () => {
    const first = await runTask(rt, task, { text: "hello" });
    expect(first).toEqual({
      value: { summary: "ok", count: 1 },
      cached: false,
      model: "gemini-3.5-flash-lite",
    });
    const second = await runTask(rt, task, { text: "hello" });
    expect(second.cached).toBe(true);
    expect(clients.get("gemini")?.requests).toHaveLength(1);
  });

  it("sends the JSON schema and asks for JSON only", async () => {
    await runTask(rt, task, { text: "hello" });
    const request = clients.get("gemini")?.requests[0];
    expect(request?.jsonSchema?.name).toBe("testTask");
    expect(request?.messages[0]?.role).toBe("system");
    expect(request?.messages[0]?.content).toContain('"summary"');
  });

  it("redacts contact details before sending", async () => {
    await runTask(rt, task, { text: "Priya Sharma, priya@example.com, +91 98765 43210" });
    const sent =
      clients
        .get("gemini")
        ?.requests[0]?.messages.map((m) => m.content)
        .join("\n") ?? "";
    expect(sent).not.toMatch(/Priya|priya@|98765/);
    expect(sent).toContain("[NAME], [EMAIL], [PHONE]");
  });

  it("repairs an invalid answer once", async () => {
    rt = runtime({
      gemini: ['```json\n{"summary":"x","count":"two"}\n```', '{"summary":"x","count":2}'],
    });
    const result = await runTask(rt, task, { text: "a" });
    expect(result.value.count).toBe(2);
    const repair = clients.get("gemini")?.requests[1]?.messages.at(-1)?.content ?? "";
    expect(repair).toContain("did not match the schema");
  });

  it("gives up after the repair also fails", async () => {
    rt = runtime({ gemini: ["not json at all", '{"summary":1}'] });
    await expect(runTask(rt, task, { text: "a" })).rejects.toBeInstanceOf(AiValidationError);
    expect((await rt.scheduler.status()).errors).toBe(1);
  });

  it("backs off on 429 using Retry-After", async () => {
    rt = runtime({
      gemini: [
        new ProviderError("slow down", "rate_limit", 429, 7000),
        '{"summary":"ok","count":1}',
      ],
    });
    await runTask(rt, task, { text: "a" });
    expect(sleeps).toContain(7000);
  });

  it("switches to the fallback provider after repeated 429s", async () => {
    const limited = () => new ProviderError("slow down", "rate_limit", 429);
    const ai = {
      ...SettingsSchema.parse({}).ai,
      fallback: {
        provider: "groq" as const,
        baseUrl: "https://api.groq.com/openai/v1",
        model: "llama-x",
      },
    };
    rt = runtime(
      {
        gemini: [limited(), limited(), limited(), limited()],
        groq: ['{"summary":"fb","count":3}'],
      },
      { ai },
    );
    const result = await runTask(rt, task, { text: "a" });
    expect(result).toMatchObject({ value: { summary: "fb" }, model: "llama-x" });
    expect(sleeps).toEqual([2000, 4000, 8000]);
  });

  it("does not retry authentication errors", async () => {
    rt = runtime({ gemini: [new ProviderError("bad key", "auth", 401)] });
    await expect(runTask(rt, task, { text: "a" })).rejects.toMatchObject({ kind: "auth" });
    expect(sleeps).toEqual([]);
  });

  it("asks for a key when the provider needs one", async () => {
    rt = runtime({ gemini: [] }, { keys: {} });
    await expect(runTask(rt, task, { text: "a" })).rejects.toBeInstanceOf(AiNotConfiguredError);
  });
});

describe("AiScheduler", () => {
  it("stops at the daily budget and warns at 80%", async () => {
    const scheduler = new AiScheduler({
      requestsPerMinute: 1000,
      dailyBudget: 5,
      usage: memoryUsageStore(),
    });
    for (let i = 0; i < 4; i++) await scheduler.run("background", () => Promise.resolve(i));
    expect(await scheduler.status()).toMatchObject({
      requests: 4,
      warning: true,
      exhausted: false,
    });
    await scheduler.run("background", () => Promise.resolve(5));
    await expect(scheduler.run("user", () => Promise.resolve(6))).rejects.toBeInstanceOf(
      AiBudgetError,
    );
    expect((await scheduler.status()).exhausted).toBe(true);
  });

  it("resets the budget on a new local day", async () => {
    const scheduler = new AiScheduler({
      requestsPerMinute: 1000,
      dailyBudget: 1,
      usage: memoryUsageStore({ date: "2000-01-01", requests: 99, cacheHits: 0, errors: 0 }),
    });
    await expect(scheduler.run("user", () => Promise.resolve("ok"))).resolves.toBe("ok");
  });

  it("waits for the rate limit", async () => {
    let now = 0;
    const waits: number[] = [];
    const scheduler = new AiScheduler({
      requestsPerMinute: 2,
      dailyBudget: 100,
      usage: memoryUsageStore(),
      now: () => now,
      sleep: (ms) => {
        waits.push(ms);
        now += ms;
        return Promise.resolve();
      },
    });
    await Promise.all([1, 2, 3].map((i) => scheduler.run("background", () => Promise.resolve(i))));
    expect(waits).toEqual([30_000]);
  });

  it("runs user requests ahead of queued background requests", async () => {
    const order: string[] = [];
    const scheduler = new AiScheduler({
      requestsPerMinute: 1000,
      dailyBudget: 100,
      usage: memoryUsageStore(),
    });
    const record = (label: string) => () => {
      order.push(label);
      return Promise.resolve();
    };
    await Promise.all([
      scheduler.run("background", record("bg-1")),
      scheduler.run("background", record("bg-2")),
      scheduler.run("user", record("user")),
    ]);
    expect(order).toEqual(["user", "bg-1", "bg-2"]);
  });
});

describe("cache keys and JSON extraction", () => {
  it("ignores object key order", async () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe('{"a":[{"c":3,"d":2}],"b":1}');
    expect(await cacheKey("t", 1, "m", { a: 1, b: 2 })).toBe(
      await cacheKey("t", 1, "m", { b: 2, a: 1 }),
    );
    expect(await cacheKey("t", 2, "m", { a: 1 })).not.toBe(await cacheKey("t", 1, "m", { a: 1 }));
  });

  it("extracts JSON from fenced or chatty replies", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Here you go: {"a":[1,2]} Thanks!')).toEqual({ a: [1, 2] });
    expect(() => extractJson("nothing")).toThrow();
  });
});
