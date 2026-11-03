/**
 * Notifications (spec 18.4, 19.2): the daily digest, follow-up reminders and
 * batched Needs-you alerts. Batched alerts reuse one notification ID per page,
 * so a new one replaces the last instead of piling up. Clicking any of them
 * opens the right dashboard page ("jc:<route>:<suffix>").
 */
import type { Settings } from "@job-copilot/shared";
import { browser } from "wxt/browser";
import type { JobCopilotDB } from "../db/db";
import { loadFlags, updateFlags } from "../settings/settings";
import { addEvent, followUpDue } from "../tracker/tracker";

/** A job counts as a strong match from this score (the green badge). */
export const STRONG_SCORE = 80;
export const NOTIFICATIONS_ALARM = "notifications";

async function show(id: string, title: string, message: string): Promise<void> {
  try {
    await browser.notifications.create(id, {
      type: "basic",
      iconUrl: browser.runtime.getURL("/icon/128.png"),
      title,
      message,
    });
  } catch {
    // Notifications are best-effort.
  }
}

const plural = (n: number, one: string, many = `${one}s`) => `${String(n)} ${n === 1 ? one : many}`;

export function digestText(matches: number, strong: number): string {
  return `${plural(matches, "new match", "new matches")}, ${String(strong)} strong`;
}

/** New matching jobs since `since`: shown in Matches, and how many are strong. */
export async function newMatches(
  db: JobCopilotDB,
  since: string,
  showThreshold: number,
): Promise<{ matches: number; strong: number }> {
  const jobs = await db.jobs.where("firstSeenAt").above(since).toArray();
  const fresh = jobs.filter((j) => j.status === "new");
  const scores = await db.scores.bulkGet(fresh.map((j) => j.id));
  const shown = scores.filter(
    (s) => s !== undefined && !s.prefilter.excluded && s.final >= showThreshold,
  );
  return {
    matches: shown.length,
    strong: shown.filter((s) => (s?.final ?? 0) >= STRONG_SCORE).length,
  };
}

/** Sends the digest once a day, at or after the chosen hour, when there is something new. */
export async function maybeSendDigest(
  db: JobCopilotDB,
  settings: Settings,
  now: Date,
): Promise<boolean> {
  if (!settings.notifications.dailyDigest || now.getHours() < settings.notifications.digestHour)
    return false;
  const flags = await loadFlags();
  const today = now.toDateString();
  if (flags.lastDigestDay === today) return false;
  const since =
    flags.lastDigestAt ??
    new Date(now.getTime() - 86_400_000).toISOString().replace(/\.\d{3}Z$/, "Z");
  const { matches, strong } = await newMatches(db, since, settings.matching.showThreshold);
  await updateFlags({ lastDigestDay: today, lastDigestAt: now.toISOString() });
  if (matches === 0) return false;
  await show("jc:matches:digest", "Today's job matches", digestText(matches, strong));
  return true;
}

/** One reminder for every application whose follow-up became due (each is reminded once). */
export async function remindFollowUps(
  db: JobCopilotDB,
  settings: Settings,
  now: Date,
): Promise<number> {
  const due = (await db.applications.where("stage").equals("applied").toArray()).filter(
    (a) =>
      followUpDue(a, settings.notifications.followUpDays, now) &&
      !a.events.some((e) => e.type === "follow_up_reminded"),
  );
  if (due.length === 0) return 0;
  await db.applications.bulkPut(due.map((a) => addEvent(a, "follow_up_reminded", now)));
  await show(
    "jc:tracker:follow-up",
    "Time to follow up",
    `${plural(due.length, "application")} ${due.length === 1 ? "has" : "have"} had no reply. A short follow-up can help.`,
  );
  return due.length;
}

/**
 * Needs-you and Review alerts, batched (spec 18.4): one notification per page
 * with the current count, replaced as the count changes.
 */
export async function alertNeedsYou(
  db: JobCopilotDB,
  settings: Settings,
  route: "needs-you" | "review",
  detail: string,
): Promise<void> {
  if (!settings.notifications.needsYouAlerts) return;
  const waiting = (await db.applications.where("status").equals("needs_you").toArray()).filter(
    (a) => (a.needsYouReason === "approval_required") === (route === "review"),
  ).length;
  const title =
    route === "review"
      ? waiting > 1
        ? `${String(waiting)} applications are ready for review`
        : "An application is ready for review"
      : waiting > 1
        ? `${String(waiting)} applications need you`
        : "An application needs you";
  await show(`jc:${route}:batch`, title, detail);
}

/** The hourly check: digest and follow-up reminders. */
export async function runNotificationChecks(
  db: JobCopilotDB,
  settings: Settings,
  now = new Date(),
): Promise<void> {
  await maybeSendDigest(db, settings, now);
  await remindFollowUps(db, settings, now);
}
