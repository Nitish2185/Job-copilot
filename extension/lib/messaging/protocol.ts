/**
 * Every message between extension parts (spec 9.5). Each type has Zod schemas for
 * its request and response and a rule saying who may send it. The background
 * validates both before a handler runs.
 */
import { CompanySchema, JobStatusSchema } from "@job-copilot/shared";
import { z } from "zod";
import { ProjectDescriptionSchema } from "../ai/tasks/describeProject";
import { ProfileDraftSchema } from "../ai/tasks/extractProfile";

const ProviderIdSchema = z.enum(["gemini", "groq", "openrouter", "ollama", "custom"]);
const ProviderTargetSchema = z.object({
  provider: ProviderIdSchema,
  baseUrl: z.url({ protocol: /^https?$/ }),
  model: z.string().min(1).max(200),
});

export const AiStatusSchema = z.object({
  configured: z.boolean(),
  provider: ProviderIdSchema,
  model: z.string(),
  usage: z.object({
    requests: z.number().int(),
    budget: z.number().int(),
    cacheHits: z.number().int(),
    errors: z.number().int(),
    warning: z.boolean(),
    exhausted: z.boolean(),
    resumesAt: z.string().optional(),
  }),
});
export type AiStatus = z.infer<typeof AiStatusSchema>;

/** Who may send a message type. */
export type SenderRule =
  | { kind: "extension" } // dashboard, popup, side panel
  | { kind: "content"; hosts: readonly string[] }; // content scripts on these exact hosts

export interface MessageDefinition<Req extends z.ZodType, Res extends z.ZodType> {
  request: Req;
  response: Res;
  sender: SenderRule;
}

const extensionOnly = { kind: "extension" } as const;

export const FeedSyncResultSchema = z.object({
  status: z.enum(["unchanged", "updated", "snapshot", "update_required", "error"]),
  added: z.number().int().nonnegative(),
  closed: z.number().int().nonnegative(),
  totalOpenJobs: z.number().int().nonnegative().optional(),
  error: z.string().optional(),
});
export type FeedSyncResult = z.infer<typeof FeedSyncResultSchema>;

export const BoardsSyncResultSchema = z.object({
  companies: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  added: z.number().int().nonnegative(),
  closed: z.number().int().nonnegative(),
});
export type BoardsSyncResult = z.infer<typeof BoardsSyncResultSchema>;

export const AiScoringResultSchema = z.object({
  scored: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
  error: z.string().optional(),
});
export type AiScoringResult = z.infer<typeof AiScoringResultSchema>;

export const ScoringQuotaSchema = z.object({
  aiConfigured: z.boolean(),
  used: z.number().int().nonnegative(),
  budget: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
});
export type ScoringQuota = z.infer<typeof ScoringQuotaSchema>;

export const MESSAGES = {
  "feed/sync": {
    request: z.object({ force: z.boolean().default(false) }),
    response: FeedSyncResultSchema,
    sender: extensionOnly,
  },
  "boards/add": {
    request: z.object({ url: z.string().min(1).max(2000), name: z.string().max(200).optional() }),
    response: z.discriminatedUnion("ok", [
      z.object({ ok: z.literal(true), company: CompanySchema, jobs: z.number().int() }),
      z.object({ ok: z.literal(false), reason: z.string() }),
    ]),
    sender: extensionOnly,
  },
  "boards/remove": {
    request: z.object({ id: z.string().min(1) }),
    response: z.object({ removed: z.boolean() }),
    sender: extensionOnly,
  },
  "boards/setEnabled": {
    request: z.object({ id: z.string().min(1), enabled: z.boolean() }),
    response: z.object({ updated: z.boolean() }),
    sender: extensionOnly,
  },
  "boards/sync": {
    request: z.object({ id: z.string().min(1).optional() }),
    response: BoardsSyncResultSchema,
    sender: extensionOnly,
  },
  "jobs/setStatus": {
    request: z.object({
      ids: z.array(z.string().min(1)).min(1).max(1000),
      status: JobStatusSchema,
    }),
    response: z.object({ updated: z.number().int().nonnegative() }),
    sender: extensionOnly,
  },
  "match/prefilter": {
    /** all: re-score every job (after a profile or preference change); else only unscored jobs. */
    request: z.object({ all: z.boolean().default(false) }),
    response: z.object({
      scored: z.number().int().nonnegative(),
      passed: z.number().int().nonnegative(),
    }),
    sender: extensionOnly,
  },
  "match/scoreNext": {
    request: z.object({
      count: z.number().int().min(1).max(100),
      order: z.enum(["newest", "best"]).default("newest"),
      jobIds: z.array(z.string().min(1)).max(50).optional(),
    }),
    response: AiScoringResultSchema,
    sender: extensionOnly,
  },
  "match/quota": {
    request: z.object({}),
    response: ScoringQuotaSchema,
    sender: extensionOnly,
  },
  "ai/status": {
    request: z.object({}),
    response: AiStatusSchema,
    sender: extensionOnly,
  },
  "ai/test": {
    request: ProviderTargetSchema,
    response: z.object({ ok: z.boolean(), error: z.string().optional() }),
    sender: extensionOnly,
  },
  "ai/listModels": {
    request: ProviderTargetSchema.omit({ model: true }),
    response: z.object({ models: z.array(z.string()) }),
    sender: extensionOnly,
  },
  "ai/extractProfile": {
    request: z.object({
      resumeText: z.string().min(1).max(200_000),
      /** The name the user confirmed, removed from the text before it is sent. */
      fullName: z.string().max(200).optional(),
    }),
    response: z.object({ draft: ProfileDraftSchema, model: z.string() }),
    sender: extensionOnly,
  },
  "ai/describeProject": {
    request: z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      languages: z.record(z.string(), z.number()),
      topics: z.array(z.string()),
      readmeExcerpt: z.string().max(5000),
    }),
    response: ProjectDescriptionSchema,
    sender: extensionOnly,
  },
} satisfies Record<string, MessageDefinition<z.ZodType, z.ZodType>>;

export type MessageType = keyof typeof MESSAGES;
export type MessageRequest<K extends MessageType> = z.input<(typeof MESSAGES)[K]["request"]>;
export type ParsedRequest<K extends MessageType> = z.output<(typeof MESSAGES)[K]["request"]>;
export type MessageResponse<K extends MessageType> = z.output<(typeof MESSAGES)[K]["response"]>;

/** Wire format of a request and its reply. */
export const EnvelopeSchema = z.object({ type: z.string(), payload: z.unknown() });
export type Reply<T> = { ok: true; data: T } | { ok: false; error: string };
export const ReplySchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: z.unknown() }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
