/**
 * Matching in the background (spec 12.4): new jobs are prefiltered right after
 * every sync and AI-scored in the background within the daily budget; the
 * dashboard asks for full re-scoring after profile changes.
 */
import { isAiConfigured } from "../ai/configured";
import { runTask } from "../ai/runner";
import { buildRuntime } from "../ai/runtime";
import type { Priority } from "../ai/scheduler";
import { scoreJobsTask } from "../ai/tasks/scoreJobs";
import { getDb } from "../db/db";
import { ScoringBudget, storageScoringUsage } from "../matching/budget";
import { prefilterJobs, scoreWithAi, type MatchInputs, type ScoreOrder } from "../matching/scoring";
import type { AiScoringResult, ScoringQuota } from "../messaging/protocol";
import type { Handlers } from "../messaging/server";
import { loadPreferences, loadProfile } from "../profile/store";
import { loadSettings } from "../settings/settings";

/** Jobs AI-scored automatically after one sync (the rest wait for the next sync or the user). */
export const BACKGROUND_SCORING_PER_RUN = 50;

async function loadInputs(): Promise<MatchInputs> {
  const db = getDb();
  const profile = await loadProfile(db);
  const [preferences, settings] = await Promise.all([
    loadPreferences(db, profile.basics.country),
    loadSettings(),
  ]);
  return { profile, preferences, settings };
}

const aiConfigured = isAiConfigured;

function budgetFor(inputs: MatchInputs): ScoringBudget {
  return new ScoringBudget(storageScoringUsage, inputs.settings.ai.dailyScoringBudget);
}

// One prefilter or AI scoring run at a time; later callers wait for the running one.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work);
  queue = next.catch(() => undefined);
  return next;
}

export function runPrefilter(all: boolean): Promise<{ scored: number; passed: number }> {
  return serial(async () =>
    prefilterJobs(getDb(), await loadInputs(), new Date(), { onlyMissing: !all }),
  );
}

export function runAiScoring(
  count: number,
  order: ScoreOrder,
  priority: Priority,
  jobIds?: readonly string[],
): Promise<AiScoringResult> {
  return serial(async (): Promise<AiScoringResult> => {
    const inputs = await loadInputs();
    const budget = budgetFor(inputs);
    if (!(await aiConfigured())) {
      const { remaining } = await budget.status();
      return { scored: 0, remaining, error: "Add an AI key to enable this" };
    }
    const rt = await buildRuntime();
    const task = scoreJobsTask(priority);
    return scoreWithAi(
      {
        db: getDb(),
        inputs,
        budget,
        score: (input) => runTask(rt, task, input),
        now: () => new Date(),
      },
      { count, order, ...(jobIds && { jobIds }) },
    );
  });
}

/** After a sync: prefilter the new jobs, then AI-score the newest in the background. */
export async function afterJobsChanged(): Promise<void> {
  await runPrefilter(false);
  const inputs = await loadInputs();
  if (inputs.profile.skills.length === 0 || !(await aiConfigured())) return;
  void runAiScoring(BACKGROUND_SCORING_PER_RUN, "newest", "background").catch(() => undefined);
}

export const matchHandlers: Handlers = {
  "match/prefilter": ({ all }) => runPrefilter(all),

  "match/scoreNext": ({ count, order, jobIds }) => runAiScoring(count, order, "user", jobIds),

  "match/quota": async (): Promise<ScoringQuota> => {
    const status = await budgetFor(await loadInputs()).status();
    return { aiConfigured: await aiConfigured(), ...status };
  },
};
