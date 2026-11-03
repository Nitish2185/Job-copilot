/**
 * Recording applications made in Assist mode (spec 16.6): the user submitted
 * the form themselves and confirms it in the side panel. One application per
 * job (spec 2.3: never apply twice).
 */
import type { Application, Job } from "@job-copilot/shared";
import type { JobCopilotDB } from "../db/db";
import type { ResumeUsed } from "../background/autofill";
import type { AutofillReportMessage } from "../messaging/protocol";

const iso = (date: Date) => date.toISOString().replace(/\.\d{3}Z$/, "Z");

const SOURCE: Record<string, Application["answersSent"][number]["source"]> = {
  profile: "profile",
  preferences: "profile",
  decline: "profile",
  answer_bank: "answer_bank",
  ai: "ai",
};

/** The existing application for this job or one with the same company, title and place. */
export async function findApplication(
  db: JobCopilotDB,
  job: Job,
): Promise<Application | undefined> {
  const direct = await db.applications.where("jobId").equals(job.id).first();
  if (direct) return direct;
  const twins = await db.jobs.where("dedupeKey").equals(job.dedupeKey).primaryKeys();
  return twins.length > 1 ? db.applications.where("jobId").anyOf(twins).first() : undefined;
}

export async function recordAssistApplication(
  db: JobCopilotDB,
  input: {
    job: Job;
    report?: AutofillReportMessage;
    /** The resume sent: which choice, and the exact file. */
    resume: ResumeUsed;
    coverLetterId?: string;
  },
  now = new Date(),
): Promise<{ application: Application; created: boolean }> {
  const existing = await findApplication(db, input.job);
  if (existing) return { application: existing, created: false };
  const at = iso(now);
  const application: Application = {
    id: crypto.randomUUID(),
    jobId: input.job.id,
    mode: "assist",
    status: "submitted",
    stage: "applied",
    resumeChoice: input.resume.choice,
    ...(input.resume.versionId && { resumeVersionId: input.resume.versionId }),
    ...(input.resume.fileId && { resumeFileId: input.resume.fileId }),
    ...(input.coverLetterId && { coverLetterId: input.coverLetterId }),
    answersSent: (input.report?.fields ?? [])
      .filter((f) => f.status === "filled" && f.value !== undefined)
      .map((f) => ({
        question: f.label,
        answer: f.value ?? "",
        source: SOURCE[f.source ?? ""] ?? "user",
      })),
    submittedAt: at,
    notes: "",
    events: [{ at, type: "submitted", detail: "You marked it as applied in the side panel." }],
  };
  await db.transaction("rw", db.applications, db.jobs, async () => {
    await db.applications.put(application);
    await db.jobs.update(input.job.id, { status: "applied" });
  });
  return { application, created: true };
}
