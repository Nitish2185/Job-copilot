/**
 * Messages from job sites (spec 13.4, 13.7, 16.6): save the job on the page,
 * quick scores for search badges, the AI fallback for unreadable pages, and
 * recording an Assist application the site confirmed.
 */
import type { JobPlatform } from "@job-copilot/shared";
import { isAiConfigured } from "../ai/configured";
import { runTask } from "../ai/runner";
import { buildRuntime } from "../ai/runtime";
import { extractJobFromPageTask } from "../ai/tasks/extractJobFromPage";
import { recordAssistApplication } from "../apply/applications";
import { resolveMode } from "../apply/mode";
import { getDb } from "../db/db";
import { jobFromCard, jobFromPage } from "../jobs/fromPage";
import { matchProfile, prefilterJob } from "../matching/prefilter";
import type { Handlers } from "../messaging/server";
import { loadPreferences, loadProfile } from "../profile/store";
import { loadSettings } from "../settings/settings";
import { comparableUrl, findJobForUrl, lastReport } from "./autofill";
import { notify } from "../queue/runner";
import { runAiScoring, runPrefilter } from "./matchHandlers";

const PLATFORMS: Record<string, JobPlatform> = {
  naukri: "naukri",
  indeed: "indeed",
  linkedin: "linkedin",
  workday: "workday",
};

export function platformForUrl(url: string): JobPlatform {
  return PLATFORMS[resolveMode(url).adapterId] ?? "other";
}

export const pageHandlers: Handlers = {
  "jobs/saveFromPage": async ({ page }) => {
    const db = getDb();
    const job = await jobFromPage(page, platformForUrl(page.url), new Date());
    const existing =
      (await db.jobs.get(job.id)) ??
      (await db.jobs.where("dedupeKey").equals(job.dedupeKey).first());
    if (existing) {
      if (existing.status === "new" || existing.status === "hidden") {
        await db.jobs.update(existing.id, { status: "saved" });
      }
      return { jobId: existing.id, created: false, mode: existing.mode };
    }
    await db.jobs.put(job);
    await runPrefilter(false);
    return { jobId: job.id, created: true, mode: job.mode };
  },

  "jobs/scoreOne": async ({ jobId }) => {
    await runPrefilter(false);
    const result = await runAiScoring(1, "best", "user", [jobId]);
    const score = await getDb().scores.get(jobId);
    return {
      ...(score && { final: score.final, isEstimate: score.isEstimate }),
      ...(result.error && { error: result.error }),
    };
  },

  "match/quickScores": async ({ cards }) => {
    const db = getDb();
    const profile = await loadProfile(db);
    const [preferences, settings] = await Promise.all([
      loadPreferences(db, profile.basics.country),
      loadSettings(),
    ]);
    if (profile.skills.length === 0) return { scores: cards.map(() => ({})) };
    const me = matchProfile(profile, preferences);
    const now = new Date();
    const saved = new Map<string, string>();
    for (const job of await db.jobs.toArray()) saved.set(comparableUrl(job.url), job.id);
    const scores = await Promise.all(
      cards.map(async (card) => {
        const jobId = saved.get(comparableUrl(card.url));
        const stored = jobId ? await db.scores.get(jobId) : undefined;
        if (stored) {
          return {
            final: stored.final,
            isEstimate: stored.isEstimate,
            ...(jobId && { jobId }),
            ...(stored.prefilter.excluded && { excluded: stored.prefilter.excluded }),
          };
        }
        const result = prefilterJob(
          jobFromCard(card, platformForUrl(card.url), now),
          me,
          preferences,
          settings.matching.minPrefilterScore,
        );
        return {
          final: result.score,
          isEstimate: true,
          ...(result.excluded && { excluded: result.excluded }),
        };
      }),
    );
    return { scores };
  },

  "ai/extractJobFromPage": async ({ url, text }) => {
    if (!(await isAiConfigured())) return { error: "Add an AI key to enable this" };
    const { value } = await runTask(await buildRuntime(), extractJobFromPageTask, { url, text });
    if (!value.isJobPosting || !value.title || !value.company)
      return { error: "This page does not look like a job posting." };
    return {
      page: {
        title: value.title,
        company: value.company,
        locations: value.locations,
        descriptionHtml: value.description,
        url,
      },
    };
  },

  "apply/assistConfirmed": async ({ url }, sender) => {
    const job = await findJobForUrl(url);
    if (!job) return { created: false };
    const tabId = sender.tab?.id;
    const report = tabId === undefined ? undefined : await lastReport(tabId);
    const { created } = await recordAssistApplication(getDb(), {
      job,
      ...(report && { report }),
      resumeChoice: "current",
    });
    if (created)
      await notify("Application recorded", `${job.title} at ${job.company.name}`, "matches");
    return { created };
  },
};
