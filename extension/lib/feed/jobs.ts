/** Feed jobs -> stored jobs, keeping everything the user did with a job. */
import { dedupeKey, modeForUrl, type FeedJob, type Job, type JobStatus } from "@job-copilot/shared";
import type { JobCopilotDB } from "../db/db";

const CHUNK = 1000;

export function feedJobToJob(f: FeedJob): Job {
  const job: Job = {
    id: f.id,
    platform: f.platform,
    source: "feed",
    company: { name: f.company.name, token: f.company.token },
    title: f.title,
    locations: f.locations,
    remote: f.remote,
    countryCodes: f.countryCodes,
    url: f.url,
    applyUrl: f.applyUrl,
    firstSeenAt: f.firstSeenAt,
    skills: f.skills,
    snippet: f.snippet,
    mode: modeForUrl(f.applyUrl),
    dedupeKey: dedupeKey(f.company.name, f.title, f.locations[0] ?? ""),
    status: "new",
    descHash: f.descHash,
  };
  if (f.postedAt) job.postedAt = f.postedAt;
  if (f.expMin !== undefined) job.experienceMin = f.expMin;
  if (f.expMax !== undefined) job.experienceMax = f.expMax;
  if (f.salary) job.salary = f.salary;
  if (f.employmentType) job.employmentType = f.employmentType;
  if (f.department) job.department = f.department;
  return job;
}

/**
 * Combines a fresh copy of a job with what is stored: the user's status, merged
 * listings and the earliest first-seen time survive; a closed job reopens; a
 * fetched description survives only while the description hash is unchanged.
 */
export function mergeJob(existing: Job | undefined, incoming: Job): Job {
  if (!existing) return incoming;
  const merged: Job = {
    ...incoming,
    status: existing.status === "closed" ? "new" : existing.status,
    firstSeenAt:
      existing.firstSeenAt < incoming.firstSeenAt ? existing.firstSeenAt : incoming.firstSeenAt,
  };
  delete merged.closedAt;
  if (existing.alsoListedOn) merged.alsoListedOn = existing.alsoListedOn;
  if (existing.description && existing.descHash === incoming.descHash) {
    merged.description = existing.description;
  }
  return merged;
}

/** Inserts or updates jobs in chunks. Returns how many were not stored before. */
export async function upsertJobs(db: JobCopilotDB, jobs: readonly Job[]): Promise<number> {
  let added = 0;
  for (let i = 0; i < jobs.length; i += CHUNK) {
    const chunk = jobs.slice(i, i + CHUNK);
    await db.transaction("rw", db.jobs, async () => {
      const existing = await db.jobs.bulkGet(chunk.map((j) => j.id));
      added += existing.filter((e) => e === undefined).length;
      await db.jobs.bulkPut(chunk.map((job, k) => mergeJob(existing[k], job)));
    });
  }
  return added;
}

/** Statuses that turn into "closed"; saved, applied, hidden and queued jobs keep theirs. */
const CLOSABLE: readonly JobStatus[] = ["new"];

/** Marks jobs closed. Returns how many open jobs were closed. */
export async function closeJobs(
  db: JobCopilotDB,
  ids: readonly string[],
  at: string,
): Promise<number> {
  let closed = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    await db.transaction("rw", db.jobs, async () => {
      const jobs = await db.jobs.bulkGet(chunk);
      const updates: Job[] = [];
      for (const job of jobs) {
        if (!job || job.closedAt) continue;
        closed++;
        updates.push({
          ...job,
          closedAt: at,
          status: CLOSABLE.includes(job.status) ? "closed" : job.status,
        });
      }
      await db.jobs.bulkPut(updates);
    });
  }
  return closed;
}
