/** Builds the AI runtime in the background service worker (all AI calls go through here). */
import type { Settings } from "@job-copilot/shared";
import { browser } from "wxt/browser";
import { z } from "zod";
import { getDb } from "../db/db";
import { loadSecrets, loadSettings } from "../settings/settings";
import { createChatClient } from "./providers";
import type { AiRuntime } from "./runner";
import { AiScheduler, type Usage, type UsageStore } from "./scheduler";
import { USAGE_HISTORY_KEY, loadUsageHistory, withDay } from "./usageHistory";

const USAGE_KEY = "aiUsage";

const UsageSchema = z.object({
  date: z.string(),
  requests: z.number().int().nonnegative(),
  cacheHits: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
});

/** Daily AI usage counters in chrome.storage.local. */
export const storageUsageStore: UsageStore = {
  async load(): Promise<Usage | undefined> {
    const stored: unknown = (await browser.storage.local.get(USAGE_KEY))[USAGE_KEY];
    const parsed = UsageSchema.safeParse(stored);
    return parsed.success ? parsed.data : undefined;
  },
  async save(usage: Usage): Promise<void> {
    await browser.storage.local.set({
      [USAGE_KEY]: usage,
      [USAGE_HISTORY_KEY]: withDay(await loadUsageHistory(), usage),
    });
  },
};

let scheduler: AiScheduler | undefined;
let schedulerSettings = "";

/** One scheduler per worker, rebuilt when its limits change. */
export function getScheduler(ai: Settings["ai"]): AiScheduler {
  const key = `${String(ai.requestsPerMinute)}:${String(ai.dailyRequestBudget)}`;
  if (!scheduler || key !== schedulerSettings) {
    scheduler = new AiScheduler({
      requestsPerMinute: ai.requestsPerMinute,
      dailyBudget: ai.dailyRequestBudget,
      usage: storageUsageStore,
    });
    schedulerSettings = key;
  }
  return scheduler;
}

export async function buildRuntime(): Promise<AiRuntime> {
  const [settings, secrets, profile] = await Promise.all([
    loadSettings(),
    loadSecrets(),
    getDb().profile.get("me"),
  ]);
  return {
    db: getDb(),
    scheduler: getScheduler(settings.ai),
    ai: settings.ai,
    keys: secrets.aiKeys,
    redact: settings.privacy.redactContactInfo,
    identity: {
      fullName: profile?.basics.fullName,
      email: profile?.basics.email,
      phone: profile?.basics.phone,
    },
    clientFor: createChatClient,
    now: () => new Date(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}
