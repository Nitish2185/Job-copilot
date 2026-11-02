/**
 * Scores in the database (spec 12): every job gets a prefilter score; jobs that
 * pass are AI-scored in batches of 10 within the daily budget. `final` is the AI
 * score when there is one, otherwise the prefilter score marked as an estimate.
 */
import type {
  AiScore,
  Job,
  JobScore,
  Preferences,
  PrefilterResult,
  Profile,
  Settings,
} from "@job-copilot/shared";
import {
  INJECTION_RED_FLAG,
  SCORE_BATCH_SIZE,
  candidateFor,
  jobForScoring,
  looksLikePromptInjection,
  type ScoreJobsInput,
  type ScoreJobsOutput,
} from "../ai/tasks/scoreJobs";
import type { JobCopilotDB } from "../db/db";
import type { ScoringBudget } from "./budget";
import { matchProfile, prefilterJob } from "./prefilter";

export interface MatchInputs {
  profile: Profile;
  preferences: Preferences;
  settings: Settings;
}

/** Jobs the user may still apply to; only these are AI-scored. */
const SCORABLE_STATUSES = new Set<Job["status"]>(["new", "saved"]);

const iso = (date: Date) => date.toISOString().replace(/\.\d{3}Z$/, "Z");

/** The AI score, but never above the prefilter score when the job text tried to steer the AI. */
export function finalFromAi(ai: AiScore, prefilter: PrefilterResult): number {
  return ai.redFlags.includes(INJECTION_RED_FLAG) ? Math.min(ai.score, prefilter.score) : ai.score;
}

/**
 * Prefilters every job (or only jobs without a score). AI scores made for the
 * current profile version are kept; older ones are dropped, so the job shows an
 * estimate until it is re-scored.
 */
export async function prefilterJobs(
  db: JobCopilotDB,
  inputs: MatchInputs,
  now: Date,
  options: { onlyMissing?: boolean } = {},
): Promise<{ scored: number; passed: number }> {
  const me = matchProfile(inputs.profile, inputs.preferences);
  const minScore = inputs.settings.matching.minPrefilterScore;
  const version = inputs.profile.version;
  const existing = new Map((await db.scores.toArray()).map((s) => [s.jobId, s]));
  const at = iso(now);
  const out: JobScore[] = [];
  let passed = 0;
  await db.jobs.each((job) => {
    const old = existing.get(job.id);
    if (options.onlyMissing && old) return;
    const prefilter = prefilterJob(job, me, inputs.preferences, minScore);
    const ai = old?.ai && old.profileVersion === version ? old.ai : undefined;
    out.push({
      jobId: job.id,
      profileVersion: version,
      prefilter,
      ...(ai && { ai }),
      ...(ai && old?.model && { model: old.model }),
      final: ai ? finalFromAi(ai, prefilter) : prefilter.score,
      isEstimate: !ai,
      scoredAt: at,
    });
    if (prefilter.passed) passed++;
  });
  for (let i = 0; i < out.length; i += 2000) await db.scores.bulkPut(out.slice(i, i + 2000));
  return { scored: out.length, passed };
}

export type ScoreOrder = "newest" | "best";

export interface AiScoringDeps {
  db: JobCopilotDB;
  inputs: MatchInputs;
  budget: ScoringBudget;
  /** Runs the scoreJobs task (through the AI runner in the background). */
  score: (input: ScoreJobsInput) => Promise<{ value: ScoreJobsOutput; model: string }>;
  now: () => Date;
}

export interface AiScoringResult {
  scored: number;
  remaining: number;
  error?: string;
}

/** Passed jobs without an AI score for this profile, in the requested order. */
export async function scoringCandidates(
  db: JobCopilotDB,
  profileVersion: number,
  order: ScoreOrder,
  jobIds?: readonly string[],
): Promise<{ job: Job; score: JobScore }[]> {
  // Named jobs (the user asked for them) are scored even when they did not pass.
  const scores = jobIds
    ? (await db.scores.bulkGet([...jobIds])).filter((s): s is JobScore => s !== undefined)
    : await db.scores.filter((s) => s.prefilter.passed && !s.ai).toArray();
  const wanted = scores.filter((s) => s.profileVersion === profileVersion && !s.prefilter.excluded);
  const jobs = await db.jobs.bulkGet(wanted.map((s) => s.jobId));
  const pairs = wanted
    .map((score, i) => ({ job: jobs[i], score }))
    .filter(
      (p): p is { job: Job; score: JobScore } =>
        p.job !== undefined && SCORABLE_STATUSES.has(p.job.status),
    );
  const posted = (j: Job) => j.postedAt ?? j.firstSeenAt;
  pairs.sort((a, b) =>
    order === "best"
      ? b.score.prefilter.score - a.score.prefilter.score
      : posted(b.job).localeCompare(posted(a.job)),
  );
  return pairs;
}

/**
 * AI-scores up to `count` jobs (newest first, or best prefilter first), in
 * batches of 10, within the daily scoring budget. Stops at the first failed batch
 * and reports what was done.
 */
export async function scoreWithAi(
  deps: AiScoringDeps,
  options: { count: number; order: ScoreOrder; jobIds?: readonly string[] },
): Promise<AiScoringResult> {
  const { db, inputs } = deps;
  const { remaining: allowed } = await deps.budget.status();
  const candidates = (
    await scoringCandidates(db, inputs.profile.version, options.order, options.jobIds)
  ).slice(0, Math.min(options.count, allowed));
  const candidate = candidateFor(inputs.profile, inputs.preferences);
  let scored = 0;

  for (let i = 0; i < candidates.length; i += SCORE_BATCH_SIZE) {
    const batch = candidates.slice(i, i + SCORE_BATCH_SIZE);
    const byKey = new Map(batch.map((c, n) => [`j${String(n + 1)}`, c]));
    const input: ScoreJobsInput = {
      candidate,
      jobs: [...byKey].map(([key, c]) => jobForScoring(c.job, key)),
    };
    let result: { value: ScoreJobsOutput; model: string };
    try {
      result = await deps.score(input);
    } catch (error) {
      const { remaining } = await deps.budget.status();
      return { scored, remaining, error: error instanceof Error ? error.message : String(error) };
    }
    await deps.budget.consume(batch.length);

    const at = iso(deps.now());
    const updates: JobScore[] = [];
    for (const { key, ...ai } of result.value.scores) {
      const target = byKey.get(key);
      if (!target) continue; // unknown keys are ignored
      byKey.delete(key);
      const text = target.job.description?.text ?? target.job.snippet;
      const redFlags =
        looksLikePromptInjection(text) && !ai.redFlags.includes(INJECTION_RED_FLAG)
          ? [...ai.redFlags, INJECTION_RED_FLAG]
          : ai.redFlags;
      const checked: AiScore = { ...ai, redFlags };
      updates.push({
        ...target.score,
        ai: checked,
        final: finalFromAi(checked, target.score.prefilter),
        isEstimate: false,
        scoredAt: at,
        model: result.model,
      });
    }
    await db.scores.bulkPut(updates);
    scored += updates.length;
  }
  const { remaining } = await deps.budget.status();
  return { scored, remaining };
}
