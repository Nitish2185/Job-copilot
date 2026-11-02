import { describe, expect, it } from "vitest";
import { AnswerBankEntrySchema } from "./answers";
import { ApplicationSchema, QueueItemSchema } from "./application";
import { JobSchema, JobScoreSchema } from "./job";
import { PreferencesSchema } from "./preferences";
import { ExperienceSchema, ProfileSchema, ProjectSchema } from "./profile";
import { StoredFileSchema } from "./resume";
import { defaultSettings, SecretsSchema, SettingsSchema } from "./settings";

const now = "2026-11-02T06:00:00Z";

describe("SettingsSchema", () => {
  it("fills every default from the spec when given an empty object", () => {
    const s = SettingsSchema.parse({});
    expect(s.ai).toMatchObject({
      provider: "gemini",
      requestsPerMinute: 10,
      dailyRequestBudget: 300,
      dailyScoringBudget: 150,
    });
    expect(s.matching).toEqual({ minPrefilterScore: 40, showThreshold: 60 });
    expect(s.autoApply).toMatchObject({
      enabled: false,
      explanationAccepted: false,
      threshold: 85,
      approvalMode: "always",
      pauseSeconds: 90,
      dailyCap: 20,
      perCompanyCap: 2,
      perCompanyWindowDays: 30,
      resumeDefault: "current",
      tailoredAboveScore: 80,
      requireApprovalForFirstTailored: 5,
      allowPrivacyAcknowledgement: false,
      dryRun: false,
    });
    expect(s.assist).toEqual({
      autofillEachStep: true,
      badges: { naukri: true, indeed: true, linkedin: false },
    });
    expect(s.tailoring).toEqual({ projectsToPick: 2, template: "classic", baseResume: "uploaded" });
    expect(s.coverLetter).toEqual({ mode: "ask" });
    expect(s.sources).toMatchObject({
      feed: true,
      personalBoards: true,
      adzuna: { enabled: false },
      jsearch: { enabled: false },
    });
    expect(s.notifications).toEqual({
      dailyDigest: true,
      digestHour: 9,
      needsYouAlerts: true,
      followUpDays: 7,
      ghostedAfterDays: 30,
    });
    expect(s.privacy).toEqual({ redactContactInfo: true });
    expect(s.ui).toEqual({ theme: "system" });
  });

  it("keeps auto-apply off by default", () => {
    expect(SettingsSchema.parse({}).autoApply.enabled).toBe(false);
  });

  it("starts development builds in dry-run mode", () => {
    expect(defaultSettings({ development: true }).autoApply.dryRun).toBe(true);
    expect(defaultSettings({ development: false }).autoApply.dryRun).toBe(false);
  });

  it.each([
    ["a pause under 30 seconds", { autoApply: { pauseSeconds: 29 } }],
    ["a daily cap over 50", { autoApply: { dailyCap: 51 } }],
    ["picking 4 projects", { tailoring: { projectsToPick: 4 } }],
    ["picking 1 project", { tailoring: { projectsToPick: 1 } }],
    ["a threshold over 100", { autoApply: { threshold: 101 } }],
    ["a bad active-hours time", { autoApply: { activeHours: { start: "9am", end: "17:00" } } }],
  ])("rejects %s", (_label, input) => {
    expect(SettingsSchema.safeParse(input).success).toBe(false);
  });

  it("keeps partial user values and fills the rest", () => {
    const s = SettingsSchema.parse({ autoApply: { pauseSeconds: 45 } });
    expect(s.autoApply.pauseSeconds).toBe(45);
    expect(s.autoApply.dailyCap).toBe(20);
  });

  it("has no secret fields", () => {
    const json = JSON.stringify(SettingsSchema.parse({}));
    expect(json).not.toMatch(/key|token|secret|password/i);
  });
});

describe("SecretsSchema", () => {
  it("defaults to no keys", () => {
    expect(SecretsSchema.parse({})).toEqual({ aiKeys: {} });
  });
});

describe("ExperienceSchema", () => {
  const base = {
    id: "e1",
    company: "Acme",
    title: "Engineer",
    startDate: "2022-01",
    endDate: "2023-06",
    bullets: [],
    skills: [],
  };

  it("accepts current roles with a null end date", () => {
    expect(ExperienceSchema.safeParse({ ...base, endDate: null }).success).toBe(true);
  });

  it("rejects an end date before the start date", () => {
    expect(ExperienceSchema.safeParse({ ...base, endDate: "2021-12" }).success).toBe(false);
  });

  it("rejects months outside 01-12", () => {
    expect(ExperienceSchema.safeParse({ ...base, startDate: "2022-13" }).success).toBe(false);
  });
});

describe("ProfileSchema", () => {
  it("accepts an empty starter profile", () => {
    const profile = {
      id: "me",
      version: 0,
      basics: {
        fullName: "",
        email: "",
        phone: "",
        city: "",
        country: "",
        otherLinks: [],
      },
      summary: "",
      totalExperienceMonths: 0,
      skills: [],
      experience: [],
      education: [],
      projects: [],
      certifications: [],
      languages: [],
      achievements: [],
      updatedAt: now,
    };
    expect(ProfileSchema.safeParse(profile).success).toBe(true);
  });
});

describe("ProjectSchema", () => {
  it("caps the README excerpt at 2000 characters", () => {
    const project = {
      id: "p1",
      name: "demo",
      description: "",
      bullets: [],
      techStack: [],
      links: {},
      source: "github",
      github: {
        fullName: "a/demo",
        stars: 0,
        forks: 0,
        isFork: false,
        archived: false,
        languages: { TypeScript: 100 },
        topics: [],
        readmeExcerpt: "x".repeat(2001),
        pushedAt: now,
      },
      included: true,
      highlight: false,
      updatedAt: now,
    };
    expect(ProjectSchema.safeParse(project).success).toBe(false);
  });
});

describe("PreferencesSchema", () => {
  it("rejects an expected CTC range whose maximum is below the minimum", () => {
    const prefs = {
      workAuthorization: [],
      needsSponsorship: false,
      noticePeriodDays: 30,
      noticeNegotiable: true,
      expectedCtc: { min: 2000000, max: 1500000, currency: "INR", period: "year" },
      salaryDisclosure: "share",
      preferredLocations: [],
      remotePreference: "any",
      willingToRelocate: false,
      desiredRoles: [],
      experienceLevel: "mid",
      jobTypes: ["full_time"],
      countries: ["IN"],
      excludeTitleKeywords: [],
      hiddenCompanies: [],
    };
    expect(PreferencesSchema.safeParse(prefs).success).toBe(false);
    expect(
      PreferencesSchema.safeParse({ ...prefs, expectedCtc: { ...prefs.expectedCtc, max: 2500000 } })
        .success,
    ).toBe(true);
  });
});

describe("AnswerBankEntrySchema", () => {
  const entry = {
    id: "a1",
    question: "Notice period?",
    normalized: "notice period",
    fingerprint: "f",
    answer: "30 days",
    fieldType: "text",
    scope: "global",
    source: "user",
    status: "active",
    sensitive: true,
    timesUsed: 0,
    createdAt: now,
  };

  it("accepts global and company scopes", () => {
    expect(AnswerBankEntrySchema.safeParse(entry).success).toBe(true);
    expect(AnswerBankEntrySchema.safeParse({ ...entry, scope: "company:acme" }).success).toBe(true);
  });

  it("rejects other scopes", () => {
    expect(AnswerBankEntrySchema.safeParse({ ...entry, scope: "team:x" }).success).toBe(false);
  });
});

describe("JobSchema and JobScoreSchema", () => {
  it("accepts a pasted job with no URLs", () => {
    const job = {
      id: `manual:${"d".repeat(64)}`,
      platform: "other",
      source: "pasted",
      company: { name: "Acme" },
      title: "Frontend Developer",
      locations: [],
      remote: "unknown",
      countryCodes: [],
      url: "",
      applyUrl: "",
      firstSeenAt: now,
      skills: ["react"],
      snippet: "",
      mode: "assist",
      dedupeKey: "acme|frontend developer|",
      status: "new",
    };
    expect(JobSchema.safeParse(job).success).toBe(true);
  });

  it("limits AI reasons to 3 items of 140 characters", () => {
    const score = {
      jobId: "j",
      profileVersion: 1,
      prefilter: { score: 50, matchedSkills: [], missingSkills: [], passed: true, reasons: [] },
      ai: {
        score: 80,
        verdict: "good",
        mustHave: [],
        niceToHave: [],
        experienceFit: "fit",
        locationFit: true,
        salaryFit: null,
        reasons: ["a", "b", "c", "d"],
        redFlags: [],
      },
      final: 80,
      isEstimate: false,
      scoredAt: now,
    };
    expect(JobScoreSchema.safeParse(score).success).toBe(false);
    score.ai.reasons = ["a", "x".repeat(141)];
    expect(JobScoreSchema.safeParse(score).success).toBe(false);
    score.ai.reasons = ["a", "b", "c"];
    expect(JobScoreSchema.safeParse(score).success).toBe(true);
  });
});

describe("ApplicationSchema and QueueItemSchema", () => {
  it("accepts a submitted application and a pending queue item", () => {
    const application = {
      id: "app1",
      jobId: "greenhouse:acme:1",
      mode: "auto",
      status: "submitted",
      stage: "applied",
      resumeChoice: "tailored",
      resumeVersionId: "rv1",
      answersSent: [{ question: "Notice period", answer: "30 days", source: "answer_bank" }],
      submittedAt: now,
      notes: "",
      events: [{ at: now, type: "submitted" }],
    };
    expect(ApplicationSchema.safeParse(application).success).toBe(true);
    const item = {
      id: "q1",
      jobId: "greenhouse:acme:1",
      applicationId: "app1",
      state: "pending",
      attempts: 0,
      scheduledFor: now,
    };
    expect(QueueItemSchema.safeParse(item).success).toBe(true);
  });
});

describe("StoredFileSchema", () => {
  it("requires a Blob", () => {
    const file = { id: "f1", name: "resume.pdf", mimeType: "application/pdf", createdAt: now };
    expect(StoredFileSchema.safeParse({ ...file, blob: new Blob(["%PDF"]) }).success).toBe(true);
    expect(StoredFileSchema.safeParse({ ...file, blob: "%PDF" }).success).toBe(false);
  });
});
