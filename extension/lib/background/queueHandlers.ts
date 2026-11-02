/** Messages for auto-apply: queueing, review, Needs-you, the kill switch and enabling (spec 16.5). */
import type { QueueItem } from "@job-copilot/shared";
import { browser } from "wxt/browser";
import { newAnswer } from "../answers/answerBank";
import { isSensitiveKey } from "../apply/fields/rules";
import { localDate } from "../ai/scheduler";
import { getDb } from "../db/db";
import type { Handlers } from "../messaging/server";
import { enqueue, pauseAutoApply, scheduleNext, tick } from "../queue/runner";
import {
  clearAutoApplyPause,
  loadFlags,
  loadSettings,
  updateFlags,
  updateSettings,
} from "../settings/settings";
import { injectAndRun } from "./autofill";

const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

async function itemFor(applicationId: string): Promise<QueueItem | undefined> {
  return getDb()
    .queue.filter((q) => q.applicationId === applicationId)
    .first();
}

/** Puts an item back in line now (after approval or new answers). */
async function requeue(applicationId: string, patch: Partial<QueueItem> = {}): Promise<boolean> {
  const db = getDb();
  const item = await itemFor(applicationId);
  if (!item) return false;
  const app = await db.applications.get(applicationId);
  await db.transaction("rw", db.queue, db.applications, db.jobs, async () => {
    await db.queue.update(item.id, {
      state: "pending",
      scheduledFor: iso(new Date()),
      attempts: 0,
      ...patch,
    });
    if (app) {
      const { needsYouReason: _reason, needsYouDetail: _detail, dryRun: _dry, ...rest } = app;
      await db.applications.put({
        ...rest,
        status: "queued",
        pendingQuestions: [],
        events: [...app.events, { at: iso(new Date()), type: "requeued" }],
      });
    }
    await db.jobs.update(item.jobId, { status: "queued" });
  });
  void tick();
  return true;
}

function waitForTab(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    const check = async () => {
      const tab = await browser.tabs.get(tabId).catch(() => undefined);
      if (!tab || tab.status === "complete") resolve();
      else setTimeout(() => void check(), 300);
    };
    void check();
  });
}

export const queueHandlers: Handlers = {
  "queue/add": async ({ jobIds }) => {
    const result = await enqueue(jobIds);
    if (result.queued > 0) void tick();
    return result;
  },

  "queue/approve": async ({ applicationId }) => ({
    ok: await requeue(applicationId, { approved: true }),
  }),

  "queue/reject": async ({ applicationId }) => {
    const db = getDb();
    const item = await itemFor(applicationId);
    if (!item) return { ok: false };
    await db.transaction("rw", db.queue, db.applications, db.jobs, async () => {
      await db.queue.update(item.id, { state: "failed" });
      await db.applications.update(applicationId, { status: "withdrawn" });
      await db.jobs.update(item.jobId, { status: "new" });
    });
    return { ok: true };
  },

  "queue/answer": async ({ applicationId, answers }) => {
    const db = getDb();
    const now = new Date();
    for (const a of answers) {
      await db.answerBank.put(
        await newAnswer(
          {
            question: a.question,
            answer: a.answer,
            fieldType: "text",
            sensitive: isSensitiveKey(a.key),
          },
          now,
        ),
      );
    }
    return { ok: await requeue(applicationId) };
  },

  "queue/openAndFinish": async ({ applicationId }) => {
    const db = getDb();
    const app = await db.applications.get(applicationId);
    const job = app ? await db.jobs.get(app.jobId) : undefined;
    if (!job) return { ok: false, error: "The job is no longer saved." };
    const tab = await browser.tabs.create({ url: job.applyUrl || job.url, active: true });
    if (tab.id === undefined) return { ok: false, error: "Could not open the page." };
    await waitForTab(tab.id);
    const result = await injectAndRun(tab.id, app?.resumeVersionId ? "tailored" : "current");
    return result.error ? { ok: false, error: result.error } : { ok: true };
  },

  "autoApply/status": async () => {
    const db = getDb();
    const [settings, flags, items, apps] = await Promise.all([
      loadSettings(),
      loadFlags(),
      db.queue.toArray(),
      db.applications.toArray(),
    ]);
    const today = localDate(Date.now());
    return {
      enabled: settings.autoApply.enabled,
      dryRun: settings.autoApply.dryRun,
      ...(flags.autoApplyPaused && { paused: flags.autoApplyPaused }),
      pending: items.filter((i) => ["pending", "preparing", "running"].includes(i.state)).length,
      review: apps.filter(
        (a) => a.status === "needs_you" && a.needsYouReason === "approval_required",
      ).length,
      needsYou: apps.filter(
        (a) => a.status === "needs_you" && a.needsYouReason !== "approval_required",
      ).length,
      sentToday: apps.filter(
        (a) => a.mode === "auto" && a.submittedAt && localDate(Date.parse(a.submittedAt)) === today,
      ).length,
      appliedToday: apps.filter(
        (a) => a.submittedAt && localDate(Date.parse(a.submittedAt)) === today,
      ).length,
      dailyCap: settings.autoApply.dailyCap,
    };
  },

  "autoApply/pause": async ({ reason }) => {
    await pauseAutoApply(reason ?? "You paused auto-apply.");
    return { ok: true };
  },

  "autoApply/resume": async () => {
    await clearAutoApplyPause();
    await scheduleNext();
    void tick();
    return { ok: true };
  },

  "autoApply/enable": async ({ threshold, approvalMode }) => {
    await updateSettings({
      autoApply: { enabled: true, explanationAccepted: true, threshold, approvalMode },
    });
    await updateFlags({ autoApplyFailures: 0 });
    return { ok: true };
  },

  "autoApply/disable": async () => {
    await updateSettings({ autoApply: { enabled: false } });
    return { ok: true };
  },
};
