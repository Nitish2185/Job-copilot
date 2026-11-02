/**
 * Runs an AI task (spec 11.2): redact -> cache -> schedule -> parse JSON ->
 * validate with Zod -> one repair retry -> AiValidationError. Rate limits back off
 * and then switch to the fallback provider. AI output is data only (spec 2.5).
 */
import type { AiProviderId, Settings } from "@job-copilot/shared";
import { z } from "zod";
import type { JobCopilotDB } from "../db/db";
import { cacheKey, getCached, putCached } from "./cache";
import {
  ProviderError,
  providerNeedsKey,
  type ChatClient,
  type ChatMessage,
  type ProviderConfig,
} from "./providers";
import { redactDeep, type Identity } from "./redact";
import type { AiScheduler, Priority } from "./scheduler";

export interface AiTask<I, O> {
  id: string;
  /** Bump when the prompt changes so cached answers are not reused. */
  promptVersion: number;
  schema: z.ZodType<O>;
  buildMessages(input: I): ChatMessage[];
  /** null: never expires. */
  cacheTtlMs: number | null;
  /** Redact contact details in the input before it leaves the device. */
  redactInput: boolean;
  priority: Priority;
}

export class AiValidationError extends Error {
  override name = "AiValidationError";
  constructor(readonly issues: string) {
    super(`The AI answer did not match the expected format: ${issues}`);
  }
}

export class AiNotConfiguredError extends Error {
  override name = "AiNotConfiguredError";
  constructor() {
    super("Add an AI key to enable this");
  }
}

export interface AiRuntime {
  db: JobCopilotDB;
  scheduler: AiScheduler;
  ai: Settings["ai"];
  keys: Partial<Record<AiProviderId, string>>;
  /** Redact contact details (settings.privacy.redactContactInfo). */
  redact: boolean;
  identity: Identity;
  clientFor(config: ProviderConfig, apiKey: string | undefined): ChatClient;
  now(): Date;
  sleep(ms: number): Promise<void>;
}

export interface TaskResult<O> {
  value: O;
  cached: boolean;
  model: string;
}

const RATE_LIMIT_RETRIES = 3;
const BASE_BACKOFF_MS = 2_000;

const JSON_RULES =
  "Reply with one JSON value only: no prose, no markdown fences. It must match this JSON Schema:";

/** Extracts the JSON value from a reply that may be wrapped in fences or prose. */
export function extractJson(raw: string): unknown {
  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(text);
  } catch {
    const start = text.search(/[[{]/);
    const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new SyntaxError("No JSON found in the answer");
  }
}

function validate<O>(
  schema: z.ZodType<O>,
  raw: string,
): { ok: true; value: O } | { ok: false; issues: string } {
  let json: unknown;
  try {
    json = extractJson(raw);
  } catch (error) {
    return { ok: false, issues: error instanceof Error ? error.message : "invalid JSON" };
  }
  const parsed = schema.safeParse(json);
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, issues: z.prettifyError(parsed.error) };
}

function primaryConfig(ai: Settings["ai"]): ProviderConfig {
  return { provider: ai.provider, baseUrl: ai.baseUrl, model: ai.model };
}

async function completeWithBackoff(
  rt: AiRuntime,
  config: ProviderConfig,
  priority: Priority,
  messages: ChatMessage[],
  jsonSchema: { name: string; schema: Record<string, unknown> },
): Promise<string> {
  const client = rt.clientFor(config, rt.keys[config.provider]);
  for (let attempt = 0; ; attempt++) {
    try {
      return await rt.scheduler.run(priority, () =>
        client.complete({ model: config.model, messages, jsonSchema }),
      );
    } catch (error) {
      const retryable =
        error instanceof ProviderError && (error.kind === "rate_limit" || error.kind === "server");
      if (!retryable || attempt >= RATE_LIMIT_RETRIES) throw error;
      await rt.sleep(error.retryAfterMs ?? BASE_BACKOFF_MS * 2 ** attempt);
    }
  }
}

/** One provider call, falling back to the backup provider when rate-limited. */
async function complete(
  rt: AiRuntime,
  priority: Priority,
  messages: ChatMessage[],
  jsonSchema: { name: string; schema: Record<string, unknown> },
): Promise<{ text: string; model: string }> {
  const primary = primaryConfig(rt.ai);
  try {
    return {
      text: await completeWithBackoff(rt, primary, priority, messages, jsonSchema),
      model: primary.model,
    };
  } catch (error) {
    const fallback = rt.ai.fallback;
    const rateLimited = error instanceof ProviderError && error.kind === "rate_limit";
    if (!fallback || !rateLimited) throw error;
    if (providerNeedsKey(fallback.provider) && !rt.keys[fallback.provider]) throw error;
    return {
      text: await completeWithBackoff(rt, fallback, priority, messages, jsonSchema),
      model: fallback.model,
    };
  }
}

export async function runTask<I, O>(
  rt: AiRuntime,
  task: AiTask<I, O>,
  input: I,
): Promise<TaskResult<O>> {
  if (providerNeedsKey(rt.ai.provider) && !rt.keys[rt.ai.provider])
    throw new AiNotConfiguredError();

  const safeInput = task.redactInput && rt.redact ? redactDeep(input, rt.identity) : input;
  const key = await cacheKey(task.id, task.promptVersion, rt.ai.model, safeInput);
  const cached = await getCached(rt.db, key, rt.now());
  if (cached !== undefined) {
    const parsed = task.schema.safeParse(cached);
    if (parsed.success) {
      await rt.scheduler.recordCacheHit();
      return { value: parsed.data, cached: true, model: rt.ai.model };
    }
  }

  const schema = z.toJSONSchema(task.schema) as Record<string, unknown>;
  const jsonSchema = { name: task.id, schema };
  const messages: ChatMessage[] = [
    { role: "system", content: `${JSON_RULES}\n${JSON.stringify(schema)}` },
    ...task.buildMessages(safeInput),
  ];

  try {
    const first = await complete(rt, task.priority, messages, jsonSchema);
    let result = validate(task.schema, first.text);
    let model = first.model;
    if (!result.ok) {
      const repair: ChatMessage[] = [
        ...messages,
        { role: "assistant", content: first.text },
        {
          role: "user",
          content: `That reply did not match the schema:\n${result.issues}\nReply with the corrected JSON only.`,
        },
      ];
      const second = await complete(rt, task.priority, repair, jsonSchema);
      result = validate(task.schema, second.text);
      model = second.model;
      if (!result.ok) throw new AiValidationError(result.issues);
    }
    await putCached(
      rt.db,
      { key, task: task.id, promptVersion: task.promptVersion, model, value: result.value },
      rt.now(),
      task.cacheTtlMs,
    );
    return { value: result.value, cached: false, model };
  } catch (error) {
    await rt.scheduler.recordError();
    throw error;
  }
}
