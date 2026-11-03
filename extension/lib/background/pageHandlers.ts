/**
 * Messages from job sites (spec 13.4, 13.7, 16.6): save the job on the page,
 * quick scores for search badges, the AI fallback for unreadable pages, and
 * recording an Assist application the site confirmed.
 */
import { sha256Hex, skillDisplayName, type JobPlatform } from "@job-copilot/shared";
import { REPO_URL } from "@job-copilot/shared/config";
import { browser } from "wxt/browser";
import { isAiConfigured } from "../ai/configured";
import { runTask } from "../ai/runner";
import { buildRuntime } from "../ai/runtime";
import { extractJobFromPageTask } from "../ai/tasks/extractJobFromPage";
import { recordAssistApplication } from "../apply/applications";
import { resolveMode } from "../apply/mode";
import { getDb } from "../db/db";
import { textToHtml } from "../jobs/description";
import { jobFromCard, jobFromPage } from "../jobs/fromPage";
import { storeOrMerge } from "../jobs/merge";
import { matchProfile, prefilterJob } from "../matching/prefilter";
import type { Handlers } from "../messaging/server";
import { loadPreferences, loadProfile } from "../profile/store";
import { loadSettings } from "../settings/settings";
import {
  DIAGNOSTICS_COMMAND,
  SAVE_JOB_COMMAND,
  type Diagnostics,
  type SaveResult,
} from "../apply/sitePage";
import {
  GENERIC_SCRIPT,
  comparableUrl,
  findJobForUrl,
  lastReport,
  lastResumeUsed,
  resumeUsed,
} from "./autofill";
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

const topSkills = (ids: readonly string[]) => ids.slice(0, 3).map(skillDisplayName);

/** Asks the page script in a tab (injecting the generic one if none runs there). */
async function askTab(tabId: number, type: string): Promise<unknown> {
  await browser.scripting.executeScript({ target: { tabId }, files: [GENERIC_SCRIPT] });
  return browser.tabs.sendMessage(tabId, { type });
}

async function activeTabId(): Promise<number | undefined> {
  const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.id;
}

/** Markdown for a GitHub issue: the page's shape only, no personal data. */
export function diagnosticsText(d: Diagnostics): string {
  const fields = d.fields.length
    ? d.fields
        .map((f) => `- ${f.label || "(no label)"} (${f.kind}${f.required ? ", required" : ""})`)
        .join("\n")
    : "- none found";
  return [
    `**Adapter:** ${d.adapterId}`,
    `**Page:** ${d.host}${d.path}`,
    `**Detected page type:** ${d.page}`,
    `**Logged in:** ${String(d.loggedIn)}`,
    `**Job details read:** ${d.jobRead ? "yes" : "no"}`,
    `**Login form:** ${d.loginForm ? "yes" : "no"} · **CAPTCHA:** ${d.captcha ? "yes" : "no"}`,
    `**Extension version:** ${d.version}`,
    "",
    `**Fields (${String(d.fields.length)}):**`,
    fields,
    "",
    "**What went wrong:** <describe it here>",
  ].join("\n");
}

/** A prefilled GitHub "new issue" link for a broken page. */
export function issueUrlFor(d: Diagnostics, text: string): string {
  const issue = new URL(`${REPO_URL}/issues/new`);
  issue.searchParams.set("title", `Broken page: ${d.adapterId} ${d.host}${d.path}`);
  issue.searchParams.set("body", text);
  return issue.href;
}

interface SaveFromTabResult {
  jobId?: string;
  created?: boolean;
  title?: string;
  final?: number;
  error?: string;
}

export async function saveFromTab(tabId: number, score: boolean): Promise<SaveFromTabResult> {
  let saved: SaveResult | undefined;
  try {
    saved = (await askTab(tabId, SAVE_JOB_COMMAND)) as SaveResult | undefined;
  } catch {
    saved = undefined;
  }
  if (!saved) return { error: "Job Copilot cannot read this page." };
  if ("error" in saved) return { error: saved.error };
  const result = { jobId: saved.jobId, created: saved.created, title: saved.title };
  if (!score) return result;
  await runPrefilter(false);
  const scored = await runAiScoring(1, "best", "user", [saved.jobId]);
  const stored = await getDb().scores.get(saved.jobId);
  return {
    ...result,
    ...(stored && { final: stored.final }),
    ...(scored.error && { error: scored.error }),
  };
}

export const SAVE_MENU_ID = "jc-save-job";
export const SCORE_MENU_ID = "jc-score-job";

/** Right-click "Save this job" and "Score this job" (spec 13.4); the click grants activeTab. */
export function registerSaveMenus(): void {
  browser.contextMenus.onClicked.addListener((info, tab) => {
    const score = info.menuItemId === SCORE_MENU_ID;
    if ((info.menuItemId !== SAVE_MENU_ID && !score) || tab?.id === undefined) return;
    void saveFromTab(tab.id, score).then(async (r) => {
      if (!r.jobId) {
        await notify("Could not save this job", r.error ?? "No job found on this page.", "matches");
        return;
      }
      const title = r.final !== undefined ? `Match score ${String(r.final)}` : "Job saved";
      const note = `${r.created ? "" : " (already saved)"}${r.error ? ` · ${r.error}` : ""}`;
      await notify(title, `${r.title ?? "This job"}${note}`, `jobs/${r.jobId}`);
    });
  });
}

export const pageHandlers: Handlers = {
  "jobs/saveFromPage": async ({ page }) => {
    const db = getDb();
    const stored = await storeOrMerge(
      db,
      await jobFromPage(page, platformForUrl(page.url), new Date()),
    );
    const { job } = stored;
    if (!stored.created && (job.status === "new" || job.status === "hidden")) {
      await db.jobs.update(job.id, { status: "saved" });
    }
    await runPrefilter(false);
    return { jobId: job.id, created: stored.created, mode: job.mode };
  },

  // "Add job manually" (spec 13.5): pasted text plus optional URL, company and title.
  "jobs/addManual": async ({ title, company, location, url, text }) => {
    const db = getDb();
    const now = new Date();
    const job = await jobFromPage(
      {
        title,
        company,
        locations: location ? [location] : [],
        descriptionHtml: textToHtml(text),
        url: url ?? "",
      },
      url ? platformForUrl(url) : "other",
      now,
    );
    const id = url
      ? job.id
      : `manual:${(await sha256Hex(`${company}|${title}|${text.slice(0, 2000)}`)).slice(0, 32)}`;
    const stored = await storeOrMerge(db, { ...job, id, source: "pasted" });
    if (!stored.created && stored.job.status !== "applied") {
      await db.jobs.update(stored.job.id, { status: "saved" });
    }
    await runPrefilter(false);
    return { jobId: stored.job.id, created: stored.created };
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
    const me = matchProfile(profile, preferences, settings.matching.maxExtraYears);
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
            matched: topSkills(stored.prefilter.matchedSkills),
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
          matched: topSkills(result.matchedSkills),
        };
      }),
    );
    return { scores };
  },

  // "AI-score the jobs on this page" (spec 13.7): the cards become new jobs, then the
  // normal scheduler scores them within the daily budget.
  "match/aiScoreCards": async ({ cards }) => {
    if (!(await isAiConfigured())) return { scores: [], error: "Add an AI key to enable this" };
    const db = getDb();
    const now = new Date();
    const ids: string[] = [];
    for (const card of cards) {
      const job = await jobFromPage(
        {
          title: card.title,
          company: card.company || "Unknown",
          locations: card.location ? [card.location] : [],
          descriptionHtml: "",
          url: card.url,
        },
        platformForUrl(card.url),
        now,
      );
      ids.push((await storeOrMerge(db, { ...job, status: "new" })).job.id);
    }
    await runPrefilter(false);
    const result = await runAiScoring(ids.length, "best", "user", ids);
    const stored = await db.scores.bulkGet(ids);
    return {
      scores: ids.map((jobId, i) => {
        const score = stored[i];
        return score
          ? {
              jobId,
              final: score.final,
              isEstimate: score.isEstimate,
              matched: topSkills(score.prefilter.matchedSkills),
              ...(score.prefilter.excluded && { excluded: score.prefilter.excluded }),
            }
          : { jobId };
      }),
      ...(result.error && { error: result.error }),
    };
  },

  "assist/pageConfig": async ({ site }) => {
    const { assist } = await loadSettings();
    const badges =
      site === "naukri" || site === "indeed" || site === "linkedin" ? assist.badges[site] : false;
    return { autofillEachStep: assist.autofillEachStep, badges };
  },

  "assist/diagnostics": async ({ tabId }) => {
    try {
      const d = (await askTab(tabId, DIAGNOSTICS_COMMAND)) as Diagnostics | undefined;
      if (!d) return { error: "Job Copilot cannot read this page." };
      const text = diagnosticsText(d);
      return { text, issueUrl: issueUrlFor(d, text) };
    } catch {
      return {
        error:
          "Job Copilot cannot read this page. Right-click the page, choose Autofill, then try again.",
      };
    }
  },

  "jobs/saveFromTab": async ({ tabId, score }) => {
    const id = tabId ?? (await activeTabId());
    if (id === undefined) return { error: "No tab to read." };
    return saveFromTab(id, score);
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
    // The resume Autofill attached in this tab (tailored or not), else the base resume.
    const used =
      (tabId === undefined ? undefined : await lastResumeUsed(tabId)) ??
      (await resumeUsed(job.id, "current"));
    const { created } = await recordAssistApplication(getDb(), {
      job,
      ...(report && { report }),
      resume: used,
    });
    if (created)
      await notify("Application recorded", `${job.title} at ${job.company.name}`, "matches");
    return { created };
  },
};
