/**
 * User settings (spec section 6). `SettingsSchema.parse({})` returns every default.
 * Settings live in chrome.storage.sync; secrets never do (see SecretsSchema).
 */
import { z } from "zod";
import {
  AI_PROVIDER_IDS,
  AI_PROVIDERS,
  AUTO_APPLY_LIMITS,
  DEFAULT_GEMINI_MODEL,
  FEED_BASE_URL,
} from "../config";

export const AiProviderIdSchema = z.enum(AI_PROVIDER_IDS);

const Score100 = z.number().int().min(0).max(100);
const TimeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM");

export const AiProviderConfigSchema = z.object({
  provider: AiProviderIdSchema,
  baseUrl: z.string(),
  model: z.string(),
});
export type AiProviderConfig = z.infer<typeof AiProviderConfigSchema>;

export const SettingsSchema = z.object({
  ai: z
    .object({
      provider: AiProviderIdSchema.default("gemini"),
      baseUrl: z.string().default(AI_PROVIDERS.gemini.baseUrl),
      model: z.string().default(DEFAULT_GEMINI_MODEL),
      fallback: AiProviderConfigSchema.optional(),
      requestsPerMinute: z.number().int().min(1).max(1000).default(10),
      dailyRequestBudget: z.number().int().min(1).default(300),
      dailyScoringBudget: z.number().int().min(0).default(150),
    })
    .prefault({}),

  matching: z
    .object({
      minPrefilterScore: Score100.default(40),
      showThreshold: Score100.default(60),
    })
    .prefault({}),

  autoApply: z
    .object({
      enabled: z.boolean().default(false),
      explanationAccepted: z.boolean().default(false),
      threshold: Score100.default(85),
      approvalMode: z.enum(["always", "below_threshold"]).default("always"),
      pauseSeconds: z
        .number()
        .int()
        .min(AUTO_APPLY_LIMITS.pauseSecondsMin)
        .default(AUTO_APPLY_LIMITS.pauseSecondsDefault),
      dailyCap: z
        .number()
        .int()
        .min(1)
        .max(AUTO_APPLY_LIMITS.dailyCapMax)
        .default(AUTO_APPLY_LIMITS.dailyCapDefault),
      perCompanyCap: z.number().int().min(1).default(AUTO_APPLY_LIMITS.perCompanyCapDefault),
      perCompanyWindowDays: z
        .number()
        .int()
        .min(1)
        .default(AUTO_APPLY_LIMITS.perCompanyWindowDaysDefault),
      resumeDefault: z.enum(["current", "tailored", "tailored_above_score"]).default("current"),
      tailoredAboveScore: Score100.default(80),
      requireApprovalForFirstTailored: z.number().int().min(0).default(5),
      allowPrivacyAcknowledgement: z.boolean().default(false),
      activeHours: z.object({ start: TimeOfDaySchema, end: TimeOfDaySchema }).optional(),
      /** Development builds default this to true (see defaultSettings). */
      dryRun: z.boolean().default(false),
    })
    .prefault({}),

  assist: z
    .object({
      autofillEachStep: z.boolean().default(true),
      badges: z
        .object({
          naukri: z.boolean().default(true),
          indeed: z.boolean().default(true),
          linkedin: z.boolean().default(false),
        })
        .prefault({}),
    })
    .prefault({}),

  tailoring: z
    .object({
      projectsToPick: z.number().int().min(2).max(3).default(2),
      template: z.enum(["classic", "compact"]).default("classic"),
    })
    .prefault({}),

  coverLetter: z
    .object({
      mode: z.enum(["off", "ask", "always"]).default("ask"),
    })
    .prefault({}),

  sources: z
    .object({
      feed: z.boolean().default(true),
      feedBaseUrl: z.string().default(FEED_BASE_URL),
      personalBoards: z.boolean().default(true),
      adzuna: z
        .object({
          enabled: z.boolean().default(false),
          country: z.string().default("in"),
          maxCallsPerDay: z.number().int().min(0).default(50),
        })
        .prefault({}),
      jsearch: z
        .object({
          enabled: z.boolean().default(false),
          maxCallsPerDay: z.number().int().min(0).default(20),
        })
        .prefault({}),
      /** Country subdomain for Indeed search links, e.g. "in" -> in.indeed.com. */
      indeedCountry: z.string().default("in"),
    })
    .prefault({}),

  notifications: z
    .object({
      dailyDigest: z.boolean().default(true),
      digestHour: z.number().int().min(0).max(23).default(9),
      needsYouAlerts: z.boolean().default(true),
      followUpDays: z.number().int().min(1).default(7),
      ghostedAfterDays: z.number().int().min(1).default(30),
    })
    .prefault({}),

  privacy: z
    .object({
      redactContactInfo: z.boolean().default(true),
    })
    .prefault({}),

  ui: z
    .object({
      theme: z.enum(["system", "light", "dark"]).default("system"),
    })
    .prefault({}),
});
export type Settings = z.infer<typeof SettingsSchema>;

/** All defaults. Development builds start in dry-run mode so nothing is ever submitted. */
export function defaultSettings(options: { development: boolean }): Settings {
  const settings = SettingsSchema.parse({});
  settings.autoApply.dryRun = options.development;
  return settings;
}

/** Secrets live only in chrome.storage.local: never synced, logged or exported by default. */
export const SecretsSchema = z.object({
  aiKeys: z.partialRecord(AiProviderIdSchema, z.string()).default({}),
  githubToken: z.string().optional(),
  adzuna: z.object({ appId: z.string(), appKey: z.string() }).optional(),
  jsearchKey: z.string().optional(),
});
export type Secrets = z.infer<typeof SecretsSchema>;
