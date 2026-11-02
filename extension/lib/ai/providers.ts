/**
 * OpenAI-compatible chat client per provider (spec 11.1). Each user's key stays on
 * their own device, so the browser SDK mode is acceptable.
 */
import { AI_PROVIDERS, type AiProviderId } from "@job-copilot/shared";
import OpenAI from "openai";

export interface ProviderConfig {
  provider: AiProviderId;
  baseUrl: string;
  model: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionRequest {
  model: string;
  messages: ChatMessage[];
  /** JSON Schema for providers with structured output; the schema is also in the prompt. */
  jsonSchema?: { name: string; schema: Record<string, unknown> };
}

export interface ChatClient {
  complete(request: CompletionRequest): Promise<string>;
  listModels(): Promise<string[]>;
}

export type ProviderErrorKind =
  "rate_limit" | "auth" | "network" | "server" | "bad_request" | "empty";

export class ProviderError extends Error {
  override name = "ProviderError";
  constructor(
    message: string,
    readonly kind: ProviderErrorKind,
    readonly status?: number,
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

/** Providers whose OpenAI-compatible endpoint accepts response_format json_schema (verified). */
export const JSON_SCHEMA_SUPPORT: Record<AiProviderId, boolean> = {
  gemini: true,
  groq: false,
  openrouter: false,
  ollama: false,
  custom: false,
};

function retryAfterMs(headers: Headers | undefined): number | undefined {
  const ms = headers?.get("retry-after-ms");
  if (ms && Number.isFinite(Number(ms))) return Number(ms);
  const value = headers?.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

/** Turns SDK errors into ProviderError with a kind the scheduler can act on. */
export function toProviderError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  if (error instanceof OpenAI.APIConnectionError) {
    return new ProviderError("Could not reach the AI provider", "network");
  }
  if (error instanceof OpenAI.APIError) {
    const status: number | undefined = typeof error.status === "number" ? error.status : undefined;
    const headers: Headers | undefined =
      error.headers instanceof Headers ? error.headers : undefined;
    const kind: ProviderErrorKind =
      status === 429
        ? "rate_limit"
        : status === 401 || status === 403
          ? "auth"
          : status !== undefined && status >= 500
            ? "server"
            : "bad_request";
    return new ProviderError(error.message, kind, status, retryAfterMs(headers));
  }
  return new ProviderError(error instanceof Error ? error.message : String(error), "network");
}

export function createChatClient(config: ProviderConfig, apiKey: string | undefined): ChatClient {
  const client = new OpenAI({
    apiKey: apiKey && apiKey.length > 0 ? apiKey : "not-needed",
    baseURL: config.baseUrl,
    dangerouslyAllowBrowser: true,
    maxRetries: 0, // the scheduler owns retries and backoff
    timeout: 60_000,
  });
  const structured = JSON_SCHEMA_SUPPORT[config.provider];

  return {
    async complete({ model, messages, jsonSchema }) {
      try {
        const response = await client.chat.completions.create({
          model,
          messages,
          temperature: 0.2,
          response_format:
            jsonSchema && structured
              ? {
                  type: "json_schema",
                  json_schema: { name: jsonSchema.name, schema: jsonSchema.schema, strict: false },
                }
              : { type: "json_object" },
        });
        const content = response.choices[0]?.message.content;
        if (!content) throw new ProviderError("The AI provider returned an empty answer", "empty");
        return content;
      } catch (error) {
        throw toProviderError(error);
      }
    },
    async listModels() {
      try {
        const page = await client.models.list();
        return page.data.map((m) => m.id.replace(/^models\//, "")).sort();
      } catch (error) {
        throw toProviderError(error);
      }
    },
  };
}

export function providerNeedsKey(provider: AiProviderId): boolean {
  return AI_PROVIDERS[provider].needsKey;
}
