import type { Job } from "@job-copilot/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { recordAssistApplication } from "@/lib/apply/applications";
import { comparableUrl, lastResumeUsed, saveResumeUsed } from "@/lib/background/autofill";
import { saveBaseResume } from "@/lib/profile/store";
import { emptyProfile } from "@/lib/profile/profile";
import { JobCopilotDB } from "@/lib/db/db";

const job = (id: string, dedupeKey = "acme|engineer|pune"): Job => ({
  id,
  platform: "lever",
  source: "feed",
  company: { name: "Acme", token: "acme" },
  title: "Engineer",
  locations: [],
  remote: "remote",
  countryCodes: [],
  url: `https://jobs.lever.co/acme/${id}`,
  applyUrl: `https://jobs.lever.co/acme/${id}/apply`,
  firstSeenAt: "2026-11-01T00:00:00Z",
  skills: [],
  snippet: "",
  mode: "auto",
  dedupeKey,
  status: "new",
});

let db: JobCopilotDB;
beforeEach(async () => {
  db = new JobCopilotDB(`apps-${crypto.randomUUID()}`);
  await db.open();
});

describe("recordAssistApplication", () => {
  it("records answers with their sources and marks the job applied", async () => {
    const j = job("1");
    await db.jobs.put(j);
    const { application, created } = await recordAssistApplication(db, {
      job: j,
      resume: { choice: "tailored", fileId: "tailored-file", versionId: "v1" },
      report: {
        url: j.applyUrl,
        mode: "assist",
        loginForm: false,
        captcha: false,
        verificationCode: false,
        fields: [
          {
            id: "1",
            label: "First name",
            key: "first_name",
            status: "filled",
            source: "profile",
            value: "Aarav",
          },
          {
            id: "2",
            label: "Why us?",
            key: "unknown",
            status: "filled",
            source: "ai",
            value: "Great team",
          },
          { id: "3", label: "Expected CTC", key: "expected_ctc", status: "needs_you" },
        ],
      },
    });
    expect(created).toBe(true);
    expect(application).toMatchObject({
      mode: "assist",
      status: "submitted",
      stage: "applied",
      resumeChoice: "tailored",
      resumeVersionId: "v1",
      resumeFileId: "tailored-file",
    });
    expect(application.answersSent).toEqual([
      { question: "First name", answer: "Aarav", source: "profile" },
      { question: "Why us?", answer: "Great team", source: "ai" },
    ]);
    expect((await db.jobs.get("1"))?.status).toBe("applied");
  });

  it("never records a second application for the same job or its duplicate listing", async () => {
    const a = job("1");
    const b = job("2"); // same company, title and place on another board
    await db.jobs.bulkPut([a, b]);
    await recordAssistApplication(db, { job: a, resume: { choice: "current" } });
    expect(
      (await recordAssistApplication(db, { job: a, resume: { choice: "current" } })).created,
    ).toBe(false);
    expect(
      (await recordAssistApplication(db, { job: b, resume: { choice: "current" } })).created,
    ).toBe(false);
    expect(await db.applications.count()).toBe(1);
  });
});

describe("comparableUrl", () => {
  it("matches job pages and their apply forms", () => {
    expect(comparableUrl("https://jobs.lever.co/acme/123/apply?lever-source=x#top")).toBe(
      comparableUrl("https://jobs.lever.co/acme/123"),
    );
    expect(comparableUrl("https://jobs.ashbyhq.com/acme/9/application")).toBe(
      "jobs.ashbyhq.com/acme/9",
    );
    expect(comparableUrl("https://JOBS.LEVER.CO/acme/123/")).toBe("jobs.lever.co/acme/123");
  });
});

describe("the resume each application was sent with", () => {
  it("keeps an old resume while an application still points at it", async () => {
    const now = new Date("2026-11-03T12:00:00Z");
    const file = (name: string) => ({ name, type: "application/pdf", blob: new Blob([name]) });
    let profile = await saveBaseResume(db, file("old.pdf"), "old", emptyProfile(now), now);
    const oldId = profile.baseResume?.fileId ?? "";
    const j = job("1");
    await db.jobs.put(j);
    await recordAssistApplication(db, { job: j, resume: { choice: "current", fileId: oldId } });

    profile = await saveBaseResume(db, file("new.pdf"), "new", profile, now);
    expect((await db.files.get(oldId))?.name).toBe("old.pdf");

    // A resume no application used is replaced as before.
    const unusedId = profile.baseResume?.fileId ?? "";
    await saveBaseResume(db, file("newer.pdf"), "newer", profile, now);
    expect(await db.files.get(unusedId)).toBeUndefined();
  });

  it("remembers which resume Autofill attached in each tab", async () => {
    await saveResumeUsed(7, { choice: "tailored", fileId: "f1", versionId: "v1" });
    await saveResumeUsed(8, { choice: "current", fileId: "f2" });
    expect(await lastResumeUsed(7)).toEqual({ choice: "tailored", fileId: "f1", versionId: "v1" });
    expect((await lastResumeUsed(8))?.fileId).toBe("f2");
    expect(await lastResumeUsed(9)).toBeUndefined();
  });
});
