import { SettingsSchema, type Job } from "@job-copilot/shared";
import { describe, expect, it } from "vitest";
import { JobCopilotDB } from "@/lib/db/db";
import { prefilterJobs } from "@/lib/matching/scoring";
import { emptyProfile } from "@/lib/profile/profile";
import { defaultPreferences } from "@/lib/profile/store";

const TITLES = [
  "Senior Backend Engineer (Go)",
  "Frontend Developer - React",
  "Full Stack Engineer, Payments",
  "Data Engineer",
  "Site Reliability Engineer",
];
const SKILLS = [
  ["go", "kubernetes", "postgresql", "aws"],
  ["react", "typescript", "javascript", "css"],
  ["nodejs", "react", "mongodb", "docker"],
  ["python", "spark", "airflow", "sql"],
  ["kubernetes", "terraform", "aws", "linux"],
];

describe("prefilter performance", () => {
  it("scores 10,000 jobs in a few seconds", async () => {
    const db = new JobCopilotDB(`perf-${crypto.randomUUID()}`);
    await db.open();
    const jobs: Job[] = Array.from({ length: 10_000 }, (_, i) => ({
      id: `lever:c${String(i % 300)}:${String(i)}`,
      platform: "lever",
      source: "feed",
      company: { name: `Company ${String(i % 300)}`, token: `c${String(i % 300)}` },
      title: TITLES[i % TITLES.length] ?? "Engineer",
      locations: [i % 2 ? "Bengaluru, India" : "Remote - US"],
      remote: i % 2 ? "hybrid" : "remote",
      countryCodes: [i % 2 ? "IN" : "US"],
      url: "",
      applyUrl: "",
      firstSeenAt: "2026-11-01T06:00:00Z",
      skills: SKILLS[i % SKILLS.length] ?? [],
      experienceMin: i % 7,
      snippet: "",
      mode: "auto",
      dedupeKey: String(i),
      status: "new",
    }));
    await db.jobs.bulkPut(jobs);
    const profile = {
      ...emptyProfile(new Date()),
      skills: [
        { id: "react", displayName: "React", source: "resume" as const },
        { id: "nodejs", displayName: "Node.js", source: "resume" as const },
      ],
      totalExperienceMonths: 48,
    };
    const preferences = {
      ...defaultPreferences("IN"),
      desiredRoles: ["Full Stack Developer"],
      excludeTitleKeywords: ["manager"],
      preferredLocations: ["Pune"],
    };
    const started = performance.now();
    const result = await prefilterJobs(
      db,
      { profile, preferences, settings: SettingsSchema.parse({}) },
      new Date(),
    );
    const ms = performance.now() - started;
    expect(result.scored).toBe(10_000);
    expect(ms).toBeLessThan(10_000);
  }, 60_000);
});
