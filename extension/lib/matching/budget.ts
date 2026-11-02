/**
 * The daily AI scoring budget (settings.ai.dailyScoringBudget, default 150 jobs).
 * Separate from the request budget: one request scores up to 10 jobs.
 */
import { browser } from "wxt/browser";
import { z } from "zod";
import { localDate } from "../ai/scheduler";

const KEY = "scoringUsage";

const UsageSchema = z.object({ date: z.string(), jobs: z.number().int().nonnegative() });
export type ScoringUsage = z.infer<typeof UsageSchema>;

export interface ScoringUsageStore {
  load(): Promise<ScoringUsage | undefined>;
  save(usage: ScoringUsage): Promise<void>;
}

export const storageScoringUsage: ScoringUsageStore = {
  async load() {
    const stored: unknown = (await browser.storage.local.get(KEY))[KEY];
    const parsed = UsageSchema.safeParse(stored);
    return parsed.success ? parsed.data : undefined;
  },
  async save(usage) {
    await browser.storage.local.set({ [KEY]: usage });
  },
};

export function memoryScoringUsage(): ScoringUsageStore {
  let usage: ScoringUsage | undefined;
  return {
    load: () => Promise.resolve(usage),
    save: (next) => {
      usage = next;
      return Promise.resolve();
    },
  };
}

export class ScoringBudget {
  constructor(
    private readonly store: ScoringUsageStore,
    private readonly dailyLimit: number,
    private readonly now: () => number = Date.now,
  ) {}

  private async today(): Promise<ScoringUsage> {
    const date = localDate(this.now());
    const usage = await this.store.load();
    return usage?.date === date ? usage : { date, jobs: 0 };
  }

  async status(): Promise<{ used: number; budget: number; remaining: number }> {
    const { jobs } = await this.today();
    return { used: jobs, budget: this.dailyLimit, remaining: Math.max(0, this.dailyLimit - jobs) };
  }

  async consume(jobs: number): Promise<void> {
    const usage = await this.today();
    await this.store.save({ date: usage.date, jobs: usage.jobs + jobs });
  }
}
