// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AnalyticsPage } from "@/entrypoints/dashboard/pages/AnalyticsPage";
import {
  applicationsPerWeek,
  funnel,
  ratesByResume,
  ratesByScore,
} from "@/lib/analytics/analytics";
import { getDb } from "@/lib/db/db";
import { buildDemoData, loadDemoData, removeDemoData } from "@/lib/demo/demoData";
import { sampleJob } from "./helpers";

const now = new Date("2026-11-03T12:00:00Z");

afterEach(async () => {
  cleanup();
  const db = getDb();
  await Promise.all([db.jobs.clear(), db.scores.clear(), db.applications.clear()]);
});

describe("demo data", () => {
  it("gives sensible analytics", () => {
    const { jobs, scores, applications } = buildDemoData(now);
    const rows = applications.map((app) => ({
      app,
      job: jobs.find((j) => j.id === app.jobId),
      score: scores.find((s) => s.jobId === app.jobId),
    }));
    const weeks = applicationsPerWeek(applications, now);
    expect(weeks.reduce((n, w) => n + w.auto + w.assist, 0)).toBe(applications.length);
    expect(weeks.some((w) => w.auto > 0) && weeks.some((w) => w.assist > 0)).toBe(true);
    const steps = funnel(applications).map((s) => s.count);
    expect(steps[0]).toBe(applications.length);
    for (let i = 1; i < steps.length; i++)
      expect(steps[i] ?? 0).toBeLessThanOrEqual(steps[i - 1] ?? 0);
    expect(steps[3]).toBeGreaterThan(0);
    const [current, tailored] = ratesByResume(rows);
    expect(tailored?.rate ?? 0).toBeGreaterThanOrEqual(current?.rate ?? 0);
    const byScore = ratesByScore(rows);
    expect(byScore[0]?.rate ?? 0).toBeGreaterThanOrEqual(byScore.at(-1)?.rate ?? 0);
  });

  it("is the same on every load and removes only its own records", async () => {
    expect(buildDemoData(now)).toEqual(buildDemoData(now));
    const db = getDb();
    await db.jobs.put(sampleJob({ id: "mine" }));
    await loadDemoData(db, now);
    expect(await db.jobs.count()).toBe(61);
    expect(await removeDemoData(db)).toBe(94);
    expect(await db.jobs.toCollection().primaryKeys()).toEqual(["mine"]);
    expect(await db.applications.count()).toBe(0);
  });
});

describe("AnalyticsPage", () => {
  it("shows the numbers for the demo data", async () => {
    await loadDemoData(getDb(), new Date());
    render(<AnalyticsPage />);
    expect(await screen.findByText("Applications sent")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Applications per week" })).toBeTruthy();
    const funnelCard = screen.getByRole("region", { name: "Funnel" });
    expect(within(funnelCard).getByRole("cell", { name: "Applied" })).toBeTruthy();
    const tailoring = screen.getByRole("region", { name: "Does tailoring help?" });
    expect(within(tailoring).getByRole("cell", { name: "Tailored resume" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Learn next" })).toBeTruthy();
  });

  it("works with no data", async () => {
    render(<AnalyticsPage />);
    expect(await screen.findByText(/Charts fill in as you apply/)).toBeTruthy();
    expect(screen.getByText("No applications sent in the last 12 weeks.")).toBeTruthy();
    expect(screen.getByText("No AI requests in the last 30 days.")).toBeTruthy();
  });
});
