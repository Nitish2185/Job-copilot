/** Tracker messages (spec 15.2, 19.2): the follow-up email draft and interview prep. */
import { isAiConfigured } from "../ai/configured";
import { AiNotConfiguredError, runTask } from "../ai/runner";
import { buildRuntime } from "../ai/runtime";
import { followUpEmailTask, followUpProblems } from "../ai/tasks/followUpEmail";
import {
  checkInterviewPrep,
  interviewPrepInput,
  interviewPrepTask,
} from "../ai/tasks/interviewPrep";
import { getDb } from "../db/db";
import type { Handlers } from "../messaging/server";
import { loadProfile } from "../profile/store";
import { analysisFor, picksFor } from "./tailorHandlers";

export async function followUpDraft(applicationId: string) {
  if (!(await isAiConfigured())) throw new AiNotConfiguredError();
  const db = getDb();
  const app = await db.applications.get(applicationId);
  if (!app) throw new Error("This application is no longer saved on this device.");
  const [job, profile] = await Promise.all([db.jobs.get(app.jobId), loadProfile(db)]);
  if (!job) throw new Error("The job for this application is no longer saved.");
  const contact = app.contacts?.[0]?.name;
  const { value } = await runTask(await buildRuntime(), followUpEmailTask, {
    job: { title: job.title, company: job.company.name },
    appliedOn: (app.submittedAt ?? "").slice(0, 10),
    candidate: {
      name: profile.basics.fullName,
      headline: profile.headline ?? "",
      skills: profile.skills.slice(0, 12).map((s) => s.displayName),
    },
    ...(contact && { contactName: contact }),
  });
  return { ...value, issues: followUpProblems(value) };
}

/** Prepares for an interview; the result is saved on the job's application, if there is one. */
export async function interviewPrepFor(jobId: string) {
  if (!(await isAiConfigured())) throw new AiNotConfiguredError();
  const db = getDb();
  const job = await db.jobs.get(jobId);
  if (!job) throw new Error("This job is no longer saved on this device.");
  const [{ analysis }, { picks }, profile] = await Promise.all([
    analysisFor(jobId),
    picksFor(jobId),
    loadProfile(db),
  ]);
  const picked = picks
    .map((p) => profile.projects.find((x) => x.id === p.projectId))
    .filter((p): p is NonNullable<typeof p> => p !== undefined);
  const { value } = await runTask(
    await buildRuntime(),
    interviewPrepTask,
    interviewPrepInput(profile, job, analysis, picked),
  );
  const prep = checkInterviewPrep(value, picked, new Date());
  const app = (await db.applications.where("jobId").equals(jobId).toArray()).find(
    (a) => a.status === "submitted" || a.status === "unconfirmed",
  );
  if (app) await db.applications.update(app.id, { interviewPrep: prep });
  return { prep, ...(app && { applicationId: app.id }) };
}

export const trackerHandlers: Handlers = {
  "ai/followUpEmail": ({ applicationId }) => followUpDraft(applicationId),
  "ai/interviewPrep": ({ jobId }) => interviewPrepFor(jobId),
};
