import type { ResumeDocument } from "@job-copilot/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { JobCopilotDB } from "@/lib/db/db";
import { pageSizeFor, relevanceFor } from "@/lib/resume/make";
import {
  deleteResumeVersion,
  saveResumeVersion,
  type NewResumeVersion,
} from "@/lib/resume/versions";

const document: ResumeDocument = {
  basics: { fullName: "Aarav Mehta", email: "", phone: "", location: "", links: [] },
  summary: "",
  skills: [],
  experience: [],
  projects: [],
  education: [],
  certifications: [],
  achievements: [],
};

const input = (overrides: Partial<NewResumeVersion> = {}): NewResumeVersion => ({
  kind: "tailored",
  jobId: "lever:acme:1",
  document,
  pdf: new Uint8Array([37, 80, 68, 70]),
  fileName: "Aarav_Mehta_Resume_Acme.pdf",
  pickedProjectIds: ["p1"],
  keywordsTargeted: ["React"],
  issues: [],
  template: "classic",
  approvedByUser: true,
  ...overrides,
});

let db: JobCopilotDB;
beforeEach(async () => {
  db = new JobCopilotDB(`versions-${crypto.randomUUID()}`);
  await db.open();
});

describe("resume versions", () => {
  it("stores the document with its PDF and records validation issues", async () => {
    const version = await saveResumeVersion(db, input({ issues: ["Summary adds numbers"] }));
    expect(version.validation).toEqual({ passed: false, issues: ["Summary adds numbers"] });
    const file = await db.files.get(version.fileId);
    expect(file?.name).toBe("Aarav_Mehta_Resume_Acme.pdf");
    expect(file?.mimeType).toBe("application/pdf");
  });

  it("keeps one generated base resume", async () => {
    await saveResumeVersion(db, input({ kind: "base_generated" }));
    const second = await saveResumeVersion(db, input({ kind: "base_generated" }));
    const bases = await db.resumeVersions.where("kind").equals("base_generated").toArray();
    expect(bases.map((v) => v.id)).toEqual([second.id]);
    expect(await db.files.count()).toBe(1);
  });

  it("deletes a version and its file unless an application used it", async () => {
    const version = await saveResumeVersion(db, input());
    expect(await deleteResumeVersion(db, version.id)).toBe(true);
    expect(await db.files.count()).toBe(0);

    const used = await saveResumeVersion(db, input());
    await db.applications.put({
      id: "app-1",
      jobId: "lever:acme:1",
      mode: "assist",
      status: "submitted",
      stage: "applied",
      resumeChoice: "tailored",
      resumeVersionId: used.id,
      answersSent: [],
      notes: "",
      events: [],
    });
    expect(await deleteResumeVersion(db, used.id)).toBe(false);
  });

  it("picks the paper size and bullet relevance", () => {
    expect(pageSizeFor("US")).toBe("LETTER");
    expect(pageSizeFor("IN")).toBe("A4");
    const relevance = relevanceFor({ mustHave: ["React"], keywords: ["Redis"] });
    expect(relevance("Built React screens backed by Redis")).toBe(2);
    expect(relevanceFor(undefined)("React")).toBe(0);
  });
});
