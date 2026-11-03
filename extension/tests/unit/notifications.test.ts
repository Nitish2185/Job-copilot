import type { Application, JobScore } from "@job-copilot/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { getDb } from "@/lib/db/db";
import {
  alertNeedsYou,
  digestText,
  maybeSendDigest,
  remindFollowUps,
} from "@/lib/notifications/notifications";
import { loadSettings, updateSettings } from "@/lib/settings/settings";
import { sampleJob } from "./helpers";

const create = vi.fn((_id: string, _options: { title: string; message: string }) =>
  Promise.resolve(""),
);

beforeEach(() => {
  fakeBrowser.reset();
  Object.assign(browser.notifications, { create });
});

afterEach(async () => {
  create.mockClear();
  const db = getDb();
  await Promise.all([db.jobs.clear(), db.scores.clear(), db.applications.clear()]);
});

const score = (jobId: string, final: number, excluded?: string): JobScore => ({
  jobId,
  profileVersion: 1,
  prefilter: {
    score: final,
    matchedSkills: [],
    missingSkills: [],
    passed: true,
    reasons: [],
    ...(excluded && { excluded }),
  },
  final,
  isEstimate: true,
  scoredAt: "2026-11-03T00:00:00Z",
});

describe("daily digest", () => {
  it("counts new shown matches and strong ones, once a day at the chosen hour", async () => {
    const db = getDb();
    await db.jobs.bulkPut([
      sampleJob({ id: "j1", firstSeenAt: "2026-11-03T02:00:00Z" }),
      sampleJob({ id: "j2", firstSeenAt: "2026-11-03T03:00:00Z" }),
      sampleJob({ id: "j3", firstSeenAt: "2026-11-03T03:00:00Z" }),
      sampleJob({ id: "j4", firstSeenAt: "2026-11-03T03:00:00Z", status: "hidden" }),
      sampleJob({ id: "old", firstSeenAt: "2026-10-01T03:00:00Z" }),
    ]);
    await db.scores.bulkPut([
      score("j1", 85),
      score("j2", 65),
      score("j3", 90, "Excluded company"),
      score("j4", 95),
      score("old", 95),
    ]);
    const settings = await loadSettings();
    const early = new Date(2026, 10, 3, settings.notifications.digestHour - 1, 0);
    expect(await maybeSendDigest(db, settings, early)).toBe(false);
    const onTime = new Date(2026, 10, 3, settings.notifications.digestHour, 5);
    expect(await maybeSendDigest(db, settings, onTime)).toBe(true);
    expect(create).toHaveBeenCalledWith(
      "jc:matches:digest",
      expect.objectContaining({ message: "2 new matches, 1 strong" }),
    );
    expect(await maybeSendDigest(db, settings, new Date(onTime.getTime() + 3_600_000))).toBe(false);
    expect(create).toHaveBeenCalledOnce();
  });

  it("stays quiet when turned off or when nothing is new", async () => {
    const off = await updateSettings({ notifications: { dailyDigest: false } });
    expect(await maybeSendDigest(getDb(), off, new Date(2026, 10, 3, 23))).toBe(false);
    const on = await updateSettings({ notifications: { dailyDigest: true } });
    expect(await maybeSendDigest(getDb(), on, new Date(2026, 10, 3, 23))).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it("words the counts", () => {
    expect(digestText(1, 0)).toBe("1 new match, 0 strong");
    expect(digestText(18, 3)).toBe("18 new matches, 3 strong");
  });
});

function app(overrides: Partial<Application>): Application {
  return {
    id: "a1",
    jobId: "j1",
    mode: "assist",
    status: "submitted",
    stage: "applied",
    resumeChoice: "current",
    answersSent: [],
    submittedAt: "2026-10-01T10:00:00Z",
    notes: "",
    events: [],
    ...overrides,
  };
}

describe("follow-up reminders", () => {
  it("reminds about each due application once, in one notification", async () => {
    const db = getDb();
    await db.applications.bulkPut([
      app({ id: "a1" }),
      app({ id: "a2" }),
      app({ id: "a3", submittedAt: "2026-11-02T10:00:00Z" }),
      app({ id: "a4", stage: "interview" }),
    ]);
    const settings = await loadSettings();
    const now = new Date("2026-11-03T10:00:00Z");
    expect(await remindFollowUps(db, settings, now)).toBe(2);
    expect(create).toHaveBeenCalledWith(
      "jc:tracker:follow-up",
      expect.objectContaining({
        message: expect.stringContaining("2 applications have") as string,
      }),
    );
    expect(await remindFollowUps(db, settings, now)).toBe(0);
    expect(create).toHaveBeenCalledOnce();
    expect((await db.applications.get("a1"))?.events.at(-1)?.type).toBe("follow_up_reminded");
  });
});

describe("needs-you alerts", () => {
  it("batches into one notification per page with the current count", async () => {
    const db = getDb();
    await db.applications.bulkPut([
      app({ id: "n1", status: "needs_you", needsYouReason: "captcha" }),
      app({ id: "n2", status: "needs_you", needsYouReason: "validation_error" }),
      app({ id: "r1", status: "needs_you", needsYouReason: "approval_required" }),
    ]);
    const settings = await loadSettings();
    await alertNeedsYou(db, settings, "needs-you", "Please solve the CAPTCHA.");
    await alertNeedsYou(db, settings, "review", "Acme is ready.");
    expect(create.mock.calls.map((c) => [c[0], c[1].title])).toEqual([
      ["jc:needs-you:batch", "2 applications need you"],
      ["jc:review:batch", "An application is ready for review"],
    ]);
  });

  it("respects the setting", async () => {
    const settings = await updateSettings({ notifications: { needsYouAlerts: false } });
    await alertNeedsYou(getDb(), settings, "needs-you", "x");
    expect(create).not.toHaveBeenCalled();
  });
});
