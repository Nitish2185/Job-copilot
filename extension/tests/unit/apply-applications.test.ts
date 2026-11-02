import type { Job } from "@job-copilot/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { recordAssistApplication } from "@/lib/apply/applications";
import { comparableUrl } from "@/lib/background/autofill";
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
      resumeChoice: "current",
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
    expect(application).toMatchObject({ mode: "assist", status: "submitted", stage: "applied" });
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
    await recordAssistApplication(db, { job: a, resumeChoice: "current" });
    expect((await recordAssistApplication(db, { job: a, resumeChoice: "current" })).created).toBe(
      false,
    );
    expect((await recordAssistApplication(db, { job: b, resumeChoice: "current" })).created).toBe(
      false,
    );
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
