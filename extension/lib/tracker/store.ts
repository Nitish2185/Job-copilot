/** Tracker reads and writes on the database (spec 19.1). */
import type { Application, ApplicationStage, Job } from "@job-copilot/shared";
import type { JobCopilotDB } from "../db/db";
import { addEvent, isTracked, moveStage } from "./tracker";

export interface SentResume {
  /** The stored file, when Job Copilot kept it. */
  fileId?: string;
  /** Its file name, e.g. "Aarav_Mehta_Backend_Acme.pdf". */
  name?: string;
  tailored: boolean;
}

export interface TrackerRow {
  app: Application;
  job: Job | undefined;
  resume: SentResume;
}

/** The resume an application was sent with: its own record, else its tailored version. */
export async function sentResume(db: JobCopilotDB, app: Application): Promise<SentResume> {
  const version = app.resumeVersionId
    ? await db.resumeVersions.get(app.resumeVersionId)
    : undefined;
  const fileId = app.resumeFileId ?? version?.fileId;
  const file = fileId ? await db.files.get(fileId) : undefined;
  return {
    tailored: app.resumeChoice === "tailored",
    ...(file && { fileId: file.id, name: file.name }),
  };
}

/** Sent applications with their jobs and resumes, newest first. */
export async function trackerRows(db: JobCopilotDB): Promise<TrackerRow[]> {
  const apps = (await db.applications.toArray())
    .filter(isTracked)
    .sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""));
  const jobs = await db.jobs.bulkGet(apps.map((a) => a.jobId));
  const resumes = await Promise.all(apps.map((app) => sentResume(db, app)));
  return apps.map((app, i) => ({ app, job: jobs[i], resume: resumes[i] ?? { tailored: false } }));
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
