/**
 * De-duplication (spec 13.8): when another source describes a job already saved
 * (same dedupeKey), keep one job with the earliest firstSeenAt, every URL
 * ("Also listed on ...") and the Auto-eligible apply URL when either has one.
 */
import type { Job } from "@job-copilot/shared";
import type { JobCopilotDB } from "../db/db";

/** The saved job with the other listing merged in, or undefined when nothing changes. */
export function mergeListing(existing: Job, incoming: Job): Job | undefined {
  if (existing.id === incoming.id) return undefined;
  let changed = false;
  const next: Job = { ...existing };

  if (incoming.firstSeenAt < existing.firstSeenAt) {
    next.firstSeenAt = incoming.firstSeenAt;
    changed = true;
  }
  const known = new Set([existing.url, ...(existing.alsoListedOn ?? []).map((l) => l.url)]);
  if (incoming.url && !known.has(incoming.url)) {
    next.alsoListedOn = [
      ...(existing.alsoListedOn ?? []),
      { platform: incoming.platform, url: incoming.url },
    ];
    changed = true;
  }
  if (incoming.mode === "auto" && existing.mode !== "auto" && incoming.applyUrl) {
    next.applyUrl = incoming.applyUrl;
    next.mode = "auto";
    changed = true;
  }
  if (!existing.description && incoming.description) {
    next.description = incoming.description;
    next.snippet = incoming.snippet;
    changed = true;
  }
  return changed ? next : undefined;
}

/** Saves a job, or merges it into the saved job it duplicates (same ID or dedupeKey). */
export async function storeOrMerge(
  db: JobCopilotDB,
  job: Job,
): Promise<{ job: Job; created: boolean }> {
  const existing =
    (await db.jobs.get(job.id)) ?? (await db.jobs.where("dedupeKey").equals(job.dedupeKey).first());
  if (!existing) {
    await db.jobs.put(job);
    return { job, created: true };
  }
  const merged = mergeListing(existing, job);
  if (merged) await db.jobs.put(merged);
  return { job: merged ?? existing, created: false };
}
