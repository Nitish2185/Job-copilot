/**
 * Analytics (spec 19.3), computed from the tracker's applications: weekly
 * volume by mode, response rates, the funnel and AI usage per day. Pure
 * functions so they can be tested on seeded data.
 */
import type { Application, ApplicationStage, Job, JobScore } from "@job-copilot/shared";
import { isTracked } from "../tracker/tracker";
import type { UsageHistory } from "../ai/usageHistory";

const DAY = 86_400_000;

/** How far along the pipeline each stage is. Rejected and ghosted are endings, not steps. */
const RANK: Partial<Record<ApplicationStage, number>> = {
  applied: 0,
  screening: 1,
  interview: 2,
  offer: 3,
  accepted: 4,
};

/** The furthest stage an application reached, from its history (a rejection after an interview still counts the interview). */
export function furthestRank(app: Application): number {
  let best = RANK[app.stage] ?? 0;
  for (const e of app.events) {
    if (e.type !== "stage" || !e.detail) continue;
    for (const stage of e.detail.split(" -> ")) {
      best = Math.max(best, RANK[stage as ApplicationStage] ?? 0);
    }
  }
  return best;
}

/** A reply of any kind: it reached screening or later. */
export const responded = (app: Application) => furthestRank(app) >= 1;

export interface AnalyticsRow {
  app: Application;
  job: Job | undefined;
  score: JobScore | undefined;
}

/** Monday of the week containing `ms`, local time, as YYYY-MM-DD. */
export function weekStart(ms: number): string {
  const d = new Date(ms);
  const back = (d.getDay() + 6) % 7;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${String(monday.getFullYear())}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
}

export interface WeekCount {
  week: string;
  auto: number;
  assist: number;
}

/** Sent applications per week for the last `weeks` weeks, oldest first, empty weeks included. */
export function applicationsPerWeek(
  apps: readonly Application[],
  now: Date,
  weeks = 12,
): WeekCount[] {
  const result: WeekCount[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    result.push({ week: weekStart(now.getTime() - i * 7 * DAY), auto: 0, assist: 0 });
  }
  const byWeek = new Map(result.map((w) => [w.week, w]));
  for (const app of apps) {
    if (!isTracked(app) || !app.submittedAt) continue;
    const bucket = byWeek.get(weekStart(Date.parse(app.submittedAt)));
    if (bucket) bucket[app.mode]++;
  }
  return result;
}

export interface RateRow {
  key: string;
  label: string;
  sent: number;
  replies: number;
  /** Share with a reply, 0-100. */
  rate: number;
}

function rates(
  rows: readonly AnalyticsRow[],
  keyOf: (row: AnalyticsRow) => { key: string; label: string } | undefined,
  order?: readonly string[],
): RateRow[] {
  const groups = new Map<string, RateRow>();
  for (const row of rows) {
    if (!isTracked(row.app)) continue;
    const k = keyOf(row);
    if (!k) continue;
    const group = groups.get(k.key) ?? { ...k, sent: 0, replies: 0, rate: 0 };
    group.sent++;
    if (responded(row.app)) group.replies++;
    groups.set(k.key, group);
  }
  const list = [...groups.values()].map((g) => ({
    ...g,
    rate: Math.round((100 * g.replies) / g.sent),
  }));
  return order
    ? list.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
    : list.sort((a, b) => b.sent - a.sent || a.label.localeCompare(b.label));
}

const PLATFORM_LABELS: Record<string, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  workable: "Workable",
  smartrecruiters: "SmartRecruiters",
  naukri: "Naukri",
  indeed: "Indeed",
  linkedin: "LinkedIn",
  workday: "Workday",
  other: "Other sites",
};

export function ratesByPlatform(rows: readonly AnalyticsRow[]): RateRow[] {
  return rates(rows, ({ job }) => {
    const key = job?.platform ?? "other";
    return { key, label: PLATFORM_LABELS[key] ?? key };
  });
}

/** Current vs tailored resume: does tailoring help? */
export function ratesByResume(rows: readonly AnalyticsRow[]): RateRow[] {
  return rates(
    rows,
    ({ app }) =>
      app.resumeChoice === "tailored"
        ? { key: "tailored", label: "Tailored resume" }
        : { key: "current", label: "My resume" },
    ["current", "tailored"],
  );
}

export const SCORE_BUCKETS = [
  { key: "80+", min: 80, label: "80 and above" },
  { key: "70-79", min: 70, label: "70-79" },
  { key: "60-69", min: 60, label: "60-69" },
  { key: "<60", min: 0, label: "Below 60" },
] as const;

export function ratesByScore(rows: readonly AnalyticsRow[]): RateRow[] {
  return rates(
    rows,
    ({ score }) => {
      if (!score) return undefined;
      const bucket = SCORE_BUCKETS.find((b) => score.final >= b.min) ?? SCORE_BUCKETS[3];
      return { key: bucket.key, label: bucket.label };
    },
    SCORE_BUCKETS.map((b) => b.key),
  );
}

export interface FunnelStep {
  stage: "applied" | "screening" | "interview" | "offer";
  label: string;
  count: number;
  /** Share of all applied, 0-100. */
  share: number;
}

export function funnel(apps: readonly Application[]): FunnelStep[] {
  const sent = apps.filter(isTracked);
  const steps = [
    { stage: "applied", label: "Applied", rank: 0 },
    { stage: "screening", label: "Screening", rank: 1 },
    { stage: "interview", label: "Interview", rank: 2 },
    { stage: "offer", label: "Offer", rank: 3 },
  ] as const;
  return steps.map(({ stage, label, rank }) => {
    const count = sent.filter((a) => furthestRank(a) >= rank).length;
    return {
      stage,
      label,
      count,
      share: sent.length === 0 ? 0 : Math.round((100 * count) / sent.length),
    };
  });
}

export interface UsageDay {
  date: string;
  requests: number;
  cacheHits: number;
}

/** The last `days` days of AI usage, oldest first, missing days as zero. */
export function usageSeries(history: UsageHistory, now: Date, days = 30): UsageDay[] {
  const result: UsageDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const pad = (n: number) => String(n).padStart(2, "0");
    const date = `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const day = history[date];
    result.push({ date, requests: day?.requests ?? 0, cacheHits: day?.cacheHits ?? 0 });
  }
  return result;
}
