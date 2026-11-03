/** Tracker reads and writes on the database (spec 19.1). */
import type { Application, ApplicationStage, Job } from "@job-copilot/shared";
import type { JobCopilotDB } from "../db/db";
import { addEvent, isTracked, moveStage } from "./tracker";

export interface TrackerRow {
  app: Application;
  job: Job | undefined;
}

/** Sent applications with their jobs, newest first. */
export async function trackerRows(db: JobCopilotDB): Promise<TrackerRow[]> {
  const apps = (await db.applications.toArray())
    .filter(isTracked)
    .sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""));
  const jobs = await db.jobs.bulkGet(apps.map((a) => a.jobId));
  return apps.map((app, i) => ({ app, job: jobs[i] }));
}

async function change(
  db: JobCopilotDB,
  id: string,
  update: (app: Application) => Application,
): Promise<Application | undefined> {
  return db.transaction("rw", db.applications, async () => {
    const app = await db.applications.get(id);
    if (!app) return undefined;
    const next = update(app);
    if (next !== app) await db.applications.put(next);
    return next;
  });
}

export function setStage(db: JobCopilotDB, id: string, stage: ApplicationStage, now = new Date()) {
  return change(db, id, (app) => moveStage(app, stage, now));
}

export function recordEvent(
  db: JobCopilotDB,
  id: string,
  type: string,
  detail?: string,
  now = new Date(),
) {
  return change(db, id, (app) => addEvent(app, type, now, detail));
}

/** Notes, follow-up date, interview dates and contacts (no event: these are the user's own edits). */
export function updateDetails(
  db: JobCopilotDB,
  id: string,
  patch: Partial<Pick<Application, "notes" | "interviewDates" | "contacts">> & {
    /** null clears the user's own date (back to the default). */
    followUpAt?: string | null;
  },
) {
  return change(db, id, (app) => {
    const { followUpAt, ...rest } = patch;
    const next: Application = { ...app, ...rest };
    if (followUpAt === null) delete next.followUpAt;
    else if (followUpAt !== undefined) next.followUpAt = followUpAt;
    return next;
  });
}
