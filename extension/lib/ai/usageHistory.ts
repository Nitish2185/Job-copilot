/** AI usage per day (spec 19.3 "AI usage over time"), kept on this device for 90 days. */
import { browser } from "wxt/browser";
import { z } from "zod";
import type { Usage } from "./scheduler";

export const USAGE_HISTORY_KEY = "aiUsageHistory";
export const USAGE_HISTORY_DAYS = 90;

const CountsSchema = z.object({
  requests: z.number().int().nonnegative(),
  cacheHits: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
});
const HistorySchema = z.record(z.string(), CountsSchema);
export type UsageHistory = z.infer<typeof HistorySchema>;

/** Requests, cache hits and errors per local day (YYYY-MM-DD). */
export async function loadUsageHistory(): Promise<UsageHistory> {
  const stored: unknown = (await browser.storage.local.get(USAGE_HISTORY_KEY))[USAGE_HISTORY_KEY];
  const parsed = HistorySchema.safeParse(stored ?? {});
  return parsed.success ? parsed.data : {};
}

/** The history with today's counters in it, keeping the last 90 days. */
export function withDay(history: UsageHistory, usage: Usage): UsageHistory {
  const { date, ...counts } = usage;
  const next: UsageHistory = { ...history, [date]: counts };
  const kept = Object.keys(next).sort().slice(-USAGE_HISTORY_DAYS);
  return Object.fromEntries(kept.map((d) => [d, next[d] ?? counts]));
}
