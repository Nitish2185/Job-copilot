/**
 * The auto-apply queue (spec 16.5) in the background service worker. Each item
 * is a state machine persisted in IndexedDB (pending -> preparing -> running ->
 * done | needs_you | failed, waiting between items), so a restarted worker picks
 * up where it stopped. Submitting happens only in the page, through the guarded
 * submit function, and only after every check passed.
 */
import type { Application, Job, QueueItem, Settings } from "@job-copilot/shared";
import { browser } from "wxt/browser";
import { AUTO_ADAPTERS } from "../apply/adapters/auto";
import type { AutofillReport } from "../apply/engine";
import { resolveMode } from "../apply/mode";
import { autofillContext, resumeUsed } from "../background/autofill";
import { coverLetterFor } from "../background/tailorHandlers";
import { getDb } from "../db/db";
import { isAiConfigured } from "../ai/configured";
import { ensureDescription, textToHtml } from "../jobs/description";
import { htmlToText } from "@job-copilot/shared";
import type { AutofillReportMessage } from "../messaging/protocol";
import { alertNeedsYou } from "../notifications/notifications";
import { loadProfile } from "../profile/store";
import { saveCoverLetter } from "../resume/coverLetter";
import { loadFlags, loadSettings, updateFlags } from "../settings/settings";
import {
  checkEligibility,
  chooseResume,
  preSubmitCheck,
  tailoredNeedsApproval,
  type PendingQuestion,
} from "./rules";

export const QUEUE_ALARM = "queue-tick";
const MAX_RETRIES = 2;
const STUCK_MS = 10 * 60_000;
const CONFIRM_MS = 30_000;
const FAILURES_BEFORE_PAUSE = 3;

const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Errors worth one more try later (the tab closed, the page did not load). */
class TransientError extends Error {
  override name = "TransientError";
}

async function event(applicationId: string, type: string, detail?: string): Promise<void> {
  const db = getDb();
  const app = await db.applications.get(applicationId);
  if (!app) return;
  await db.applications.update(applicationId, {
    events: [...app.events, { at: iso(new Date()), type, ...(detail && { detail }) }],
  });
}

async function hasResume(): Promise<boolean> {
  const db = getDb();
  const [profile, generated] = await Promise.all([
    loadProfile(db),
    db.resumeVersions.where("kind").equals("base_generated").count(),
  ]);
  return Boolean(profile.baseResume) || generated > 0;
}

/** Adds jobs to the queue after the eligibility check (spec 16.5 step 1). */
export async function enqueue(
  jobIds: readonly string[],
): Promise<{ queued: number; skipped: { jobId: string; reason: string }[] }> {
  const db = getDb();
  const [settings, flags, profile, resume] = await Promise.all([
    loadSettings(),
    loadFlags(),
    loadProfile(db),
    hasResume(),
  ]);
  const applications = await db.applications.toArray();
  const jobs = new Map((await db.jobs.toArray()).map((j) => [j.id, j]));
  const skipped: { jobId: string; reason: string }[] = [];
  let queued = 0;
  const now = new Date();
  for (const jobId of jobIds) {
    const job = jobs.get(jobId);
    if (!job) {
      skipped.push({ jobId, reason: "Job not found." });
      continue;
    }
    const eligibility = checkEligibility({
      settings,
      ...(flags.autoApplyPaused && { paused: flags.autoApplyPaused }),
      job,
      ...(await db.scores.get(jobId).then((s) => (s ? { score: s } : {}))),
      profile,
      applications,
      jobs,
      approved: false,
      hasResume: resume,
      now,
    });
    if (eligibility.status === "blocked") {
      skipped.push({ jobId, reason: eligibility.reasons.join(" ") });
      continue;
    }
    const score = await db.scores.get(jobId);
    const resumeChoice = chooseResume(settings, score);
    const application: Application = {
      id: crypto.randomUUID(),
      jobId,
      mode: "auto",
      status: "queued",
      stage: "applied",
      resumeChoice,
      answersSent: [],
      notes: "",
      events: [{ at: iso(now), type: "queued" }],
    };
    const item: QueueItem = {
      id: crypto.randomUUID(),
      jobId,
      applicationId: application.id,
      state: "pending",
      attempts: 0,
      scheduledFor: iso(now),
      resumeChoice,
    };
    await db.transaction("rw", db.applications, db.queue, db.jobs, async () => {
      await db.applications.put(application);
      await db.queue.put(item);
      await db.jobs.update(jobId, { status: "queued" });
    });
    applications.push(application);
    queued++;
  }
  await scheduleNext();
  return { queued, skipped };
}

/** Sets the queue alarm for the next item that is due (spec 9.4: alarms survive sleep). */
export async function scheduleNext(): Promise<void> {
  const db = getDb();
  const next = (await db.queue.where("state").equals("pending").sortBy("scheduledFor"))[0];
  if (!next) {
    await browser.alarms.clear(QUEUE_ALARM);
    return;
  }
  const when = Math.max(Date.now() + 1000, Date.parse(next.scheduledFor));
  await browser.alarms.create(QUEUE_ALARM, { when });
}

async function updateItem(id: string, patch: Partial<QueueItem>): Promise<void> {
  await getDb().queue.update(id, patch);
}

async function finish(
  item: QueueItem,
  state: QueueItem["state"],
  application: Partial<Application>,
  jobStatus?: Job["status"],
): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.queue, db.applications, db.jobs, async () => {
    await db.queue.update(item.id, { state });
    await db.applications.update(item.applicationId, application);
    if (jobStatus) await db.jobs.update(item.jobId, { status: jobStatus });
  });
}

function answersFrom(report: AutofillReport | AutofillReportMessage): Application["answersSent"] {
  const source = (s: string | undefined): Application["answersSent"][number]["source"] =>
    s === "ai" ? "ai" : s === "answer_bank" ? "answer_bank" : "profile";
  return report.fields
    .filter((f) => f.status === "filled" && f.value !== undefined)
    .map((f) => ({ question: f.label, answer: f.value ?? "", source: source(f.source) }));
}

// ---------------------------------------------------------------- tabs

async function waitForLoad(tabId: number, timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const tab = await browser.tabs.get(tabId).catch(() => undefined);
    if (!tab) throw new TransientError("The application tab was closed.");
    if (tab.status === "complete") return;
    await sleep(300);
  }
  throw new TransientError("The application page did not load.");
}

/** Sends to the page's Auto script, retrying while it starts. */
async function toPage<T>(tabId: number, message: object, timeoutMs = 15_000): Promise<T> {
  const start = Date.now();
  let last: unknown;
  while (Date.now() - start < timeoutMs) {
    try {
      const reply: unknown = await browser.tabs.sendMessage(tabId, message);
      if (reply !== undefined) return reply as T;
    } catch (e) {
      last = e;
    }
    await sleep(500);
  }
  throw new TransientError(
    last instanceof Error ? last.message : "The application page did not answer.",
  );
}

async function closeTab(tabId: number | undefined): Promise<void> {
  if (tabId !== undefined) await browser.tabs.remove(tabId).catch(() => undefined);
}

// ---------------------------------------------------------------- notifications and pausing

export async function notify(title: string, message: string, route: string): Promise<void> {
  try {
    await browser.notifications.create(`jc:${route}:${String(Date.now())}`, {
      type: "basic",
      iconUrl: browser.runtime.getURL("/icon/128.png"),
      title,
      message,
    });
  } catch {
    // Notifications are best-effort.
  }
}

export async function pauseAutoApply(reason: string): Promise<void> {
  await updateFlags({ autoApplyPaused: { at: iso(new Date()), reason } });
  await notify("Auto-apply paused", reason, "settings");
}

async function recordFailure(): Promise<void> {
  const failures = ((await loadFlags()).autoApplyFailures ?? 0) + 1;
  await updateFlags({ autoApplyFailures: failures });
  if (failures >= FAILURES_BEFORE_PAUSE) {
    await updateFlags({ autoApplyFailures: 0 });
    await pauseAutoApply(
      `${String(FAILURES_BEFORE_PAUSE)} applications in a row could not be completed.`,
    );
  }
}

// ---------------------------------------------------------------- one item

interface PageStatus {
  confirmation: { confirmed: boolean; text?: string };
  errors: string[];
  captcha: boolean;
  verificationCode: boolean;
}

async function needsYou(
  item: QueueItem,
  reason: Application["needsYouReason"],
  detail: string,
  report?: AutofillReport,
  pending: PendingQuestion[] = [],
): Promise<void> {
  await finish(
    item,
    "needs_you",
    {
      status: "needs_you",
      ...(reason && { needsYouReason: reason }),
      needsYouDetail: detail,
      ...(report && { answersSent: answersFrom(report) }),
      pendingQuestions: pending,
    },
    "needs_you",
  );
  await event(item.applicationId, "needs_you", detail);
  await alertNeedsYou(
    getDb(),
    await loadSettings(),
    reason === "approval_required" ? "review" : "needs-you",
    detail,
  );
}

/** The safe sanitizer for the background (no DOM): text, escaped back into paragraphs. */
const textOnlySanitize = (html: string) => textToHtml(htmlToText(html));

async function runItem(item: QueueItem, settings: Settings): Promise<void> {
  const db = getDb();
  const job = await db.jobs.get(item.jobId);
  if (!job) {
    await finish(item, "failed", {
      status: "failed",
      needsYouDetail: "The job is no longer saved.",
    });
    return;
  }
  const [flags, profile, score, applications, allJobs, resume] = await Promise.all([
    loadFlags(),
    loadProfile(db),
    db.scores.get(job.id),
    db.applications.toArray(),
    db.jobs.toArray(),
    hasResume(),
  ]);
  const approved = item.approved === true;

  // 1. Eligibility, again: things change while an item waits.
  const eligibility = checkEligibility({
    settings,
    ...(flags.autoApplyPaused && { paused: flags.autoApplyPaused }),
    job,
    ...(score && { score }),
    profile,
    applications,
    jobs: new Map(allJobs.map((j) => [j.id, j])),
    approved,
    hasResume: resume,
    now: new Date(),
    selfApplicationId: item.applicationId,
  });
  if (eligibility.status === "blocked") {
    await finish(
      item,
      "failed",
      { status: "failed", needsYouDetail: eligibility.reasons.join(" ") },
      "new",
    );
    await event(item.applicationId, "not_eligible", eligibility.reasons.join(" "));
    return;
  }
  if (eligibility.status === "wait") {
    await updateItem(item.id, { state: "pending", scheduledFor: iso(eligibility.until) });
    await event(item.applicationId, "waiting", eligibility.reason);
    return;
  }
  let approval = eligibility.status === "needs_approval" ? eligibility.reason : undefined;

  // 2. Prepare: description, analysis, resume choice, cover letter.
  await updateItem(item.id, { state: "preparing", startedAt: iso(new Date()) });
  await db.applications.update(item.applicationId, { status: "in_progress" });
  await ensureDescription(
    db,
    { fetch: (i, init) => fetch(i, init), sanitize: textOnlySanitize, now: () => new Date() },
    job,
  ).catch(() => undefined);
  const resumeChoice = item.resumeChoice ?? chooseResume(settings, score);
  let resumeVersionId: string | undefined;
  if (resumeChoice === "tailored") {
    const tailored = (await db.resumeVersions.where("jobId").equals(job.id).toArray())
      .filter((v) => v.kind === "tailored")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const sentBefore = applications.filter(
      (a) => a.resumeChoice === "tailored" && a.submittedAt,
    ).length;
    const why = tailoredNeedsApproval(settings, sentBefore, tailored?.validation.issues);
    if (why && !approved) approval ??= why;
    if (!tailored && approved) {
      await needsYou(
        item,
        "approval_required",
        "Make the tailored resume for this job, then approve again.",
      );
      return;
    }
    resumeVersionId = tailored?.id;
  }
  if (settings.coverLetter.mode === "always" && (await isAiConfigured())) {
    const existing = await db.coverLetters.where("jobId").equals(job.id).first();
    if (!existing) {
      const letter = await coverLetterFor(job.id).catch(() => undefined);
      if (letter)
        await saveCoverLetter(db, { jobId: job.id, text: letter.text, issues: letter.issues });
    }
  }

  // 3. Open the application form in a background tab, without taking focus.
  const target = resolveMode(job.applyUrl || job.url);
  if (target.mode !== "auto") {
    await finish(item, "failed", { status: "failed", needsYouDetail: "Not an Auto site." }, "new");
    return;
  }
  const site = AUTO_ADAPTERS[target.adapterId];
  const url = site.applyUrl?.(new URL(job.applyUrl || job.url)) ?? (job.applyUrl || job.url);
  await updateItem(item.id, { state: "running", startedAt: iso(new Date()) });
  const tab = await browser.tabs.create({ url, active: false });
  const tabId = tab.id;
  if (tabId === undefined) throw new TransientError("Could not open a tab.");
  await updateItem(item.id, { tabId });
  try {
    // 4. Fill.
    const choice = resumeVersionId ? "tailored" : "current";
    const sentFileId = (await resumeUsed(job.id, choice)).fileId;
    const fill = async () => {
      await waitForLoad(tabId);
      const data = await autofillContext(url, choice);
      const reply = await toPage<{
        report?: AutofillReport;
        submitFound?: boolean;
        error?: string;
      }>(tabId, {
        type: "jc-auto-fill",
        data,
      });
      if (!reply.report) throw new TransientError(reply.error ?? "The form could not be filled.");
      return { report: reply.report, submitFound: reply.submitFound === true };
    };
    let { report, submitFound } = await fill();

    // 5. Pre-submit checks: any failure means the user decides; nothing is sent.
    const check = preSubmitCheck(report, approved);
    if (!check.ok) {
      if (check.reason === "captcha")
        await pauseAutoApply("A CAPTCHA appeared on an application form.");
      await needsYou(item, check.reason, check.detail, report, check.pending);
      return;
    }
    if (approval && !approved) {
      await needsYou(item, "approval_required", approval, report);
      return;
    }
    if (!submitFound) {
      await needsYou(
        item,
        "other",
        "Job Copilot could not find the submit button on this form.",
        report,
      );
      return;
    }
    if (settings.autoApply.dryRun) {
      await finish(
        item,
        "done",
        {
          status: "needs_you",
          needsYouReason: "other",
          needsYouDetail: "Dry run: this is what would have been submitted. Nothing was sent.",
          dryRun: true,
          answersSent: answersFrom(report),
          ...(resumeVersionId && { resumeVersionId }),
          ...(sentFileId && { resumeFileId: sentFileId }),
        },
        "needs_you",
      );
      await event(item.applicationId, "dry_run", "Stopped before submitting (dry run).");
      return;
    }
    if ((await loadFlags()).autoApplyPaused) {
      await updateItem(item.id, { state: "pending" });
      return;
    }

    // 6-7. Submit through the guarded function in the page, then wait for confirmation.
    let refilled = false;
    for (;;) {
      const submitted = await toPage<{ ok: boolean; error?: string }>(tabId, {
        type: "jc-auto-submit",
      });
      if (!submitted.ok) {
        await needsYou(item, "other", submitted.error ?? "Could not press submit.", report);
        return;
      }
      await event(item.applicationId, "submit_clicked");
      const status = await waitForOutcome(tabId);
      if (status?.confirmation.confirmed) {
        const letter = await db.coverLetters.where("jobId").equals(job.id).first();
        await finish(
          item,
          "done",
          {
            status: "submitted",
            submittedAt: iso(new Date()),
            answersSent: answersFrom(report),
            resumeChoice: choice,
            ...(resumeVersionId && { resumeVersionId }),
            ...(sentFileId && { resumeFileId: sentFileId }),
            ...(sentFileId && { resumeFileId: sentFileId }),
            ...(letter && { coverLetterId: letter.id }),
            ...(status.confirmation.text && { confirmationText: status.confirmation.text }),
            pendingQuestions: [],
          },
          "applied",
        );
        await event(item.applicationId, "submitted", status.confirmation.text);
        await updateFlags({ autoApplyFailures: 0 });
        await notify("Application sent", `${job.title} at ${job.company.name}`, "tracker");
        return;
      }
      if (status?.captcha) {
        await pauseAutoApply("A CAPTCHA appeared after submitting an application.");
        await needsYou(
          item,
          "captcha",
          "The site showed a CAPTCHA after submitting. Please finish it yourself.",
          report,
        );
        return;
      }
      if (status?.verificationCode) {
        await needsYou(item, "verification_code", "The site asks for a verification code.", report);
        return;
      }
      if (status && status.errors.length > 0) {
        if (refilled) {
          await needsYou(item, "validation_error", status.errors.join(" "), report);
          await recordFailure();
          return;
        }
        // Re-fill the flagged fields once and try again (spec 16.5 step 7).
        refilled = true;
        ({ report, submitFound } = await fill());
        const again = preSubmitCheck(report, approved);
        if (!again.ok || !submitFound) {
          await needsYou(item, "validation_error", status.errors.join(" "), report);
          return;
        }
        continue;
      }
      // Neither confirmation nor errors: the user should check.
      await finish(
        item,
        "done",
        {
          status: "unconfirmed",
          submittedAt: iso(new Date()),
          answersSent: answersFrom(report),
          ...(resumeVersionId && { resumeVersionId }),
          ...(sentFileId && { resumeFileId: sentFileId }),
        },
        "applied",
      );
      await event(
        item.applicationId,
        "unconfirmed",
        "No confirmation was shown within 30 seconds.",
      );
      await notify(
        "Please check an application",
        `${job.title} at ${job.company.name} showed no confirmation.`,
        "tracker",
      );
      return;
    }
  } finally {
    await closeTab(tabId);
  }
}

/** Polls the page (which may reload after submitting) for up to 30 seconds. */
async function waitForOutcome(tabId: number): Promise<PageStatus | undefined> {
  const start = Date.now();
  let last: PageStatus | undefined;
  while (Date.now() - start < CONFIRM_MS) {
    await sleep(1000);
    try {
      await waitForLoad(tabId, 5000);
      last = await toPage<PageStatus>(tabId, { type: "jc-auto-status" }, 3000);
      if (last.confirmation.confirmed || last.captcha || last.verificationCode) return last;
      if (last.errors.length > 0 && Date.now() - start > 3000) return last;
    } catch {
      // The page is between loads; try again.
    }
  }
  return last;
}

// ---------------------------------------------------------------- the tick

let running: Promise<void> | undefined;

/** Runs the next due item (one at a time) and schedules the following one. */
export function tick(): Promise<void> {
  running ??= (async () => {
    try {
      await runDue();
    } finally {
      running = undefined;
    }
  })();
  return running;
}

async function runDue(): Promise<void> {
  const db = getDb();
  // Items stuck in a step (the worker stopped) are retried or given up.
  const now = Date.now();
  for (const stuck of await db.queue.where("state").anyOf(["preparing", "running"]).toArray()) {
    if (!stuck.startedAt || now - Date.parse(stuck.startedAt) > STUCK_MS) {
      await closeTab(stuck.tabId);
      await retryOrFail(stuck, "The previous attempt stopped unexpectedly.");
    }
  }
  const flags = await loadFlags();
  if (flags.autoApplyPaused) return;
  const settings = await loadSettings();
  const due = (await db.queue.where("state").equals("pending").sortBy("scheduledFor")).find(
    (i) => Date.parse(i.scheduledFor) <= Date.now(),
  );
  if (due) {
    try {
      await runItem(due, settings);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await closeTab((await db.queue.get(due.id))?.tabId);
      if (e instanceof TransientError) await retryOrFail(due, message);
      else {
        await finish(due, "failed", { status: "failed", needsYouDetail: message }, "new");
        await recordFailure();
      }
    }
    // Pause between automatic submissions (spec 2.4).
    const pauseUntil = Date.now() + settings.autoApply.pauseSeconds * 1000;
    for (const next of await db.queue.where("state").equals("pending").toArray()) {
      if (Date.parse(next.scheduledFor) < pauseUntil) {
        await updateItem(next.id, { scheduledFor: iso(new Date(pauseUntil)) });
      }
    }
  }
  await scheduleNext();
}

async function retryOrFail(item: QueueItem, message: string): Promise<void> {
  const attempts = item.attempts + 1;
  if (attempts <= MAX_RETRIES) {
    await updateItem(item.id, {
      state: "pending",
      attempts,
      lastError: message,
      scheduledFor: iso(new Date(Date.now() + 60_000)),
    });
    await event(item.applicationId, "retry", message);
    return;
  }
  await finish(item, "failed", { status: "failed", needsYouDetail: message }, "new");
  await recordFailure();
  await notify("An application failed", message, "needs-you");
}
