/**
 * Resume tailoring and cover letters in the background (spec 14.2, 15.1). Every
 * AI call goes through the runner; inputs are read from the database here, so
 * the dashboard only sends IDs.
 */
import type { JdAnalysis } from "@job-copilot/shared";
import { isAiConfigured } from "../ai/configured";
import { runTask } from "../ai/runner";
import { buildRuntime } from "../ai/runtime";
import { analyzeJdTask } from "../ai/tasks/analyzeJd";
import { pickProjectsTask, projectsForPicking } from "../ai/tasks/pickProjects";
import { getDb } from "../db/db";
import { LOCAL_MODEL, analysisFromAi, jobText, localJdAnalysis } from "../jobs/analysis";
import type { Handlers } from "../messaging/server";
import { loadProfile } from "../profile/store";
import { finalizePicks, type ProjectPick } from "../resume/pick";
import { loadSettings } from "../settings/settings";

/**
 * The job's analysis: the stored one when it fits, otherwise a new AI analysis
 * (or a local one without AI). A failed AI call falls back to the local analysis.
 */
export async function analysisFor(
  jobId: string,
  refresh = false,
): Promise<{ analysis: JdAnalysis; aiError?: string }> {
  const db = getDb();
  const job = await db.jobs.get(jobId);
  if (!job) throw new Error("This job is no longer saved on this device.");
  const ai = await isAiConfigured();
  const stored = await db.jdAnalyses.get(jobId);
  if (stored && !refresh && (stored.model !== LOCAL_MODEL || !ai)) return { analysis: stored };

  const now = new Date();
  if (!ai) {
    const local = localJdAnalysis(job, now);
    await db.jdAnalyses.put(local);
    return { analysis: local };
  }
  try {
    const result = await runTask(await buildRuntime(), analyzeJdTask, {
      title: job.title,
      company: job.company.name,
      description: jobText(job),
    });
    const analysis = analysisFromAi(job, result.value, result.model, now);
    await db.jdAnalyses.put(analysis);
    return { analysis };
  } catch (error) {
    const local = localJdAnalysis(job, now);
    return {
      analysis: stored ?? local,
      aiError: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Projects for a tailored resume (spec 14.2 step 2). The AI is asked only when
 * there are more real projects than places; otherwise, or when it fails, the
 * local ranking decides.
 */
export async function picksFor(
  jobId: string,
  requested?: number,
): Promise<{ picks: ProjectPick[]; source: "ai" | "local"; aiError?: string }> {
  const [{ analysis }, profile, settings] = await Promise.all([
    analysisFor(jobId),
    loadProfile(getDb()),
    loadSettings(),
  ]);
  const count = requested ?? settings.tailoring.projectsToPick;
  const candidates = profile.projects.filter((p) => p.included);
  const local = () => finalizePicks(profile.projects, analysis, count);
  if (candidates.length <= count || !(await isAiConfigured())) {
    return { picks: local(), source: "local" };
  }
  const sent = projectsForPicking(candidates);
  const keys = new Map(sent.map((p, i) => [p.key, candidates[i]?.id ?? ""]));
  try {
    const result = await runTask(await buildRuntime(), pickProjectsTask, {
      job: {
        mustHave: analysis.mustHave,
        niceToHave: analysis.niceToHave,
        keywords: analysis.keywords,
        responsibilitiesSummary: analysis.responsibilitiesSummary,
      },
      projects: sent,
      count,
    });
    return {
      picks: finalizePicks(profile.projects, analysis, count, { output: result.value, keys }),
      source: "ai",
    };
  } catch (error) {
    return {
      picks: local(),
      source: "local",
      aiError: error instanceof Error ? error.message : String(error),
    };
  }
}

export const tailorHandlers: Handlers = {
  "ai/analyzeJd": ({ jobId, refresh }) => analysisFor(jobId, refresh),
  "ai/pickProjects": ({ jobId, count }) => picksFor(jobId, count),
};
