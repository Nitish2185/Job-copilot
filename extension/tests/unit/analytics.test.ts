import type { Application, JobScore } from "@job-copilot/shared";
import { describe, expect, it } from "vitest";
import {
  applicationsPerWeek,
  funnel,
  furthestRank,
  ratesByPlatform,
  ratesByResume,
  ratesByScore,
  usageSeries,
  weekStart,
} from "@/lib/analytics/analytics";
import { withDay } from "@/lib/ai/usageHistory";
import { sampleJob } from "./helpers";

function app(id: string, overrides: Partial<Application> = {}): Application {
  return {
    id,
    jobId: id,
    mode: "assist",
    status: "submitted",
    stage: "applied",
    resumeChoice: "current",
    answersSent: [],
    submittedAt: "2026-10-28T10:00:00Z",
    notes: "",
    events: [],
    ...overrides,
  };
}

const stage = (from: string, to: string) => ({
  at: "2026-10-30T10:00:00Z",
  type: "stage",
  detail: `${from} -> ${to}`,
});

const score = (final: number): JobScore => ({
  jobId: "x",
  profileVersion: 1,
  prefilter: { score: final, matchedSkills: [], missingSkills: [], passed: true, reasons: [] },
  final,
  isEstimate: false,
  scoredAt: "2026-10-28T00:00:00Z",
});

describe("furthest stage", () => {
  it("counts an interview that later ended in a rejection", () => {
    const rejected = app("a", {
      stage: "rejected",
      events: [stage("applied", "interview"), stage("interview", "rejected")],
    });
    expect(furthestRank(rejected)).toBe(2);
    expect(furthestRank(app("b", { stage: "ghosted" }))).toBe(0);
  });
});

describe("applications per week", () => {
  it("buckets sent applications by Monday, by mode, with empty weeks", () => {
    expect(weekStart(new Date(2026, 10, 1).getTime())).toBe("2026-10-26"); // a Sunday
    const weeks = applicationsPerWeek(
      [
        app("a"),
        app("b", { mode: "auto" }),
        app("c", { submittedAt: "2026-10-20T10:00:00Z" }),
        app("d", { status: "needs_you" }),
      ],
      new Date(2026, 10, 3),
      3,
    );
    expect(weeks).toEqual([
      { week: "2026-10-19", auto: 0, assist: 1 },
      { week: "2026-10-26", auto: 1, assist: 1 },
      { week: "2026-11-02", auto: 0, assist: 0 },
    ]);
  });
});

describe("response rates", () => {
  const rows = [
    {
      app: app("a", { stage: "screening" }),
      job: sampleJob({ platform: "lever" }),
      score: score(85),
    },
    { app: app("b"), job: sampleJob({ platform: "lever" }), score: score(82) },
    {
      app: app("c", { resumeChoice: "tailored", stage: "interview" }),
      job: sampleJob({ platform: "naukri" }),
      score: score(65),
    },
    { app: app("d", { status: "needs_you" }), job: sampleJob(), score: score(90) },
  ];

  it("by platform, most applications first", () => {
    expect(ratesByPlatform(rows)).toEqual([
      { key: "lever", label: "Lever", sent: 2, replies: 1, rate: 50 },
      { key: "naukri", label: "Naukri", sent: 1, replies: 1, rate: 100 },
    ]);
  });

  it("by resume type and score bucket, in a fixed order", () => {
    expect(ratesByResume(rows).map((r) => [r.key, r.rate])).toEqual([
      ["current", 50],
      ["tailored", 100],
    ]);
    expect(ratesByScore(rows).map((r) => [r.key, r.sent])).toEqual([
      ["80+", 2],
      ["60-69", 1],
    ]);
  });
});

describe("funnel", () => {
  it("counts how many reached each step, and is all zero without data", () => {
    const steps = funnel([
      app("a"),
      app("b", { stage: "screening" }),
      app("c", { stage: "offer" }),
      app("d", { stage: "rejected", events: [stage("applied", "interview")] }),
    ]);
    expect(steps.map((s) => [s.stage, s.count, s.share])).toEqual([
      ["applied", 4, 100],
      ["screening", 3, 75],
      ["interview", 2, 50],
      ["offer", 1, 25],
    ]);
    expect(funnel([]).every((s) => s.count === 0 && s.share === 0)).toBe(true);
  });
});

describe("AI usage", () => {
  it("keeps 90 days and fills missing days with zero", () => {
    let history = {};
    for (let d = 1; d <= 95; d++) {
      const day = new Date(2026, 6, d);
      const date = day.toISOString().slice(0, 10);
      history = withDay(history, { date, requests: d, cacheHits: 0, errors: 0 });
    }
    expect(Object.keys(history)).toHaveLength(90);
    const series = usageSeries(
      { "2026-11-02": { requests: 12, cacheHits: 3, errors: 0 } },
      new Date(2026, 10, 3),
      3,
    );
    expect(series).toEqual([
      { date: "2026-11-01", requests: 0, cacheHits: 0 },
      { date: "2026-11-02", requests: 12, cacheHits: 3 },
      { date: "2026-11-03", requests: 0, cacheHits: 0 },
    ]);
  });
});
