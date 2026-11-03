/**
 * Retention (spec 20): closed jobs older than 60 days are removed unless the
 * user saved or applied to them, and expired AI cache entries are dropped.
 * Runs once a day.
 */
import { pruneExpired } from "../ai/cache";
import type { JobCopilotDB } from "../db/db";

export const CLOSED_JOB_DAYS = 60;

export async function pruneClosedJobs(db: JobCopilotDB, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - CLOSED_JOB_DAYS * 86_400_000).toISOString();
  const applied = new Set((await db.applications.toArray()).map((a) => a.jobId));
  const old = await db.jobs
    .where("status")
    .equals("closed")
    .filter((j) => j.closedAt !== undefined && j.closedAt < cutoff && !applied.has(j.id))
    .primaryKeys();
  if (old.length === 0) return 0;
  await db.transaction("rw", db.jobs, db.scores, db.jdAnalyses, async () => {
    await db.jobs.bulkDelete(old);
    await db.scores.bulkDelete(old);
    await db.jdAnalyses.bulkDelete(old);
  });
  return old.length;
}

export async function runRetention(
  db: JobCopilotDB,
  now = new Date(),
): Promise<{ jobs: number; cache: number }> {
  return { jobs: await pruneClosedJobs(db, now), cache: await pruneExpired(db, now) };
}
