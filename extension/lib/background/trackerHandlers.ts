/** Tracker messages (spec 19.2): the follow-up email draft. */
import { isAiConfigured } from "../ai/configured";
import { AiNotConfiguredError, runTask } from "../ai/runner";
import { buildRuntime } from "../ai/runtime";
import { followUpEmailTask, followUpProblems } from "../ai/tasks/followUpEmail";
import { getDb } from "../db/db";
import type { Handlers } from "../messaging/server";
import { loadProfile } from "../profile/store";

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

export const trackerHandlers: Handlers = {
  "ai/followUpEmail": ({ applicationId }) => followUpDraft(applicationId),
};
