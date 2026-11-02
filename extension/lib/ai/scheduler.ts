/**
 * AI request scheduler (spec 11.3): a token bucket per provider, a daily request
 * budget (warning at 80%, pause at 100% until local midnight) and a priority
 * queue where user-initiated work runs before background work. One request runs
 * at a time.
 */

export type Priority = "user" | "background";

export interface Usage {
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  requests: number;
  cacheHits: number;
  errors: number;
}

export interface UsageStore {
  load(): Promise<Usage | undefined>;
  save(usage: Usage): Promise<void>;
}

export class AiBudgetError extends Error {
  override name = "AiBudgetError";
  constructor(readonly resumesAt: Date) {
    super(`AI limit reached, resumes at ${resumesAt.toLocaleString()}`);
  }
}

export interface SchedulerOptions {
  requestsPerMinute: number;
  dailyBudget: number;
  usage: UsageStore;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

interface Waiter {
  priority: Priority;
  run: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

export function localDate(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function nextLocalMidnight(ms: number): Date {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
}

export interface UsageStatus extends Usage {
  budget: number;
  warning: boolean;
  exhausted: boolean;
  resumesAt?: Date;
}

export class AiScheduler {
  private tokens: number;
  private lastRefill: number;
  private queue: Waiter[] = [];
  private pumping = false;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: SchedulerOptions) {
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.tokens = options.requestsPerMinute;
    this.lastRefill = this.now();
  }

  /** Queues a provider request; resolves with its result. */
  run<T>(priority: Priority, task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ priority, run: task, resolve: resolve as (v: unknown) => void, reject });
      void this.pump();
    });
  }

  async status(): Promise<UsageStatus> {
    const usage = await this.usage();
    const exhausted = usage.requests >= this.options.dailyBudget;
    const status: UsageStatus = {
      ...usage,
      budget: this.options.dailyBudget,
      warning: usage.requests >= this.options.dailyBudget * 0.8,
      exhausted,
    };
    if (exhausted) status.resumesAt = nextLocalMidnight(this.now());
    return status;
  }

  async recordCacheHit(): Promise<void> {
    const usage = await this.usage();
    await this.options.usage.save({ ...usage, cacheHits: usage.cacheHits + 1 });
  }

  async recordError(): Promise<void> {
    const usage = await this.usage();
    await this.options.usage.save({ ...usage, errors: usage.errors + 1 });
  }

  private async usage(): Promise<Usage> {
    const today = localDate(this.now());
    const stored = await this.options.usage.load();
    return stored?.date === today ? stored : { date: today, requests: 0, cacheHits: 0, errors: 0 };
  }

  private refill(): void {
    const now = this.now();
    const perMs = this.options.requestsPerMinute / 60_000;
    this.tokens = Math.min(
      this.options.requestsPerMinute,
      this.tokens + (now - this.lastRefill) * perMs,
    );
    this.lastRefill = now;
  }

  private next(): Waiter | undefined {
    const index = this.queue.findIndex((w) => w.priority === "user");
    return this.queue.splice(index >= 0 ? index : 0, 1)[0];
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.queue.length > 0) {
        const usage = await this.usage();
        if (usage.requests >= this.options.dailyBudget) {
          const error = new AiBudgetError(nextLocalMidnight(this.now()));
          for (const waiter of this.queue.splice(0)) waiter.reject(error);
          return;
        }
        this.refill();
        if (this.tokens < 1) {
          const waitMs = Math.ceil((1 - this.tokens) / (this.options.requestsPerMinute / 60_000));
          await this.sleep(waitMs);
          continue;
        }
        const waiter = this.next();
        if (!waiter) break;
        this.tokens -= 1;
        await this.options.usage.save({ ...usage, requests: usage.requests + 1 });
        try {
          waiter.resolve(await waiter.run());
        } catch (error) {
          waiter.reject(error);
        }
      }
    } finally {
      this.pumping = false;
    }
  }
}

/** In-memory usage store (tests). */
export function memoryUsageStore(initial?: Usage): UsageStore {
  let usage = initial;
  return {
    load: () => Promise.resolve(usage),
    save: (u) => {
      usage = u;
      return Promise.resolve();
    },
  };
}
