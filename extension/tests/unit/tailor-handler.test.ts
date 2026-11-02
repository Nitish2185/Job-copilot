import type { Job, Profile } from "@job-copilot/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as Runner from "@/lib/ai/runner";
import type { TailorResumeOutput } from "@/lib/ai/tasks/tailorResume";
import { tailoredFor } from "@/lib/background/tailorHandlers";
import { getDb } from "@/lib/db/db";
import { emptyProfile } from "@/lib/profile/profile";
import { updateSecrets } from "@/lib/settings/settings";

const output: TailorResumeOutput = {
  summary:
    "Full-stack developer with 4 years of React and Node.js work, now focused on TypeScript.",
  skillsOrder: ["typescript", "react", "nodejs"],
  experienceRewrites: [
    {
      experienceKey: "e1",
      bulletIndex: 0,
      text: "Shipped payment dashboards in React and TypeScript",
    },
    { experienceKey: "e1", bulletIndex: 1, text: "Cut latency 80% with Redis" },
  ],
  experienceBulletOrder: [{ experienceKey: "e1", order: [1, 0] }],
  projectBullets: [
    { projectKey: "p1", bullets: ["Built a Next.js job board", "Stored listings in PostgreSQL"] },
  ],
  keywordsTargeted: ["TypeScript"],
};

const runTask = vi.hoisted(() =>
  vi.fn((_rt: Runner.AiRuntime, task: { id: string }, _input: unknown) =>
    Promise.resolve(
      task.id === "tailorResume"
        ? { value: output, model: "mock", cached: false }
        : {
            value: {
              mustHave: ["React", "TypeScript"],
              niceToHave: [],
              keywords: ["TypeScript"],
              seniority: "mid",
              responsibilitiesSummary: "Web app",
            },
            model: "mock",
            cached: false,
          },
    ),
  ),
);
vi.mock("@/lib/ai/runner", async (importOriginal) => ({
  ...(await importOriginal<typeof Runner>()),
  runTask,
}));

const job: Job = {
  id: "lever:acme:1",
  platform: "lever",
  source: "feed",
  company: { name: "Acme", token: "acme" },
  title: "TypeScript Developer",
  locations: [],
  remote: "remote",
  countryCodes: [],
  url: "",
  applyUrl: "",
  firstSeenAt: "2026-11-01T06:00:00Z",
  skills: ["typescript", "react"],
  snippet: "TypeScript and React.",
  mode: "auto",
  dedupeKey: "1",
  status: "new",
};

const profile: Profile = {
  ...emptyProfile(new Date("2026-11-02T00:00:00Z")),
  summary: "Full-stack developer with 4 years of experience building React and Node.js apps.",
  skills: [
    { id: "react", displayName: "React", source: "resume" },
    { id: "nodejs", displayName: "Node.js", source: "resume" },
    { id: "typescript", displayName: "TypeScript", source: "resume" },
    { id: "redis", displayName: "Redis", source: "resume" },
  ],
  experience: [
    {
      id: "exp-1",
      company: "Example Fintech",
      title: "Software Engineer",
      startDate: "2022-07",
      endDate: null,
      bullets: [
        "Built payment dashboards with React, TypeScript and Node.js",
        "Reduced API latency by 30% using Redis caching",
      ],
      skills: [],
    },
  ],
  totalExperienceMonths: 53,
  projects: [
    {
      id: "proj-1",
      name: "Job Board",
      description: "A job listing app built with Next.js and PostgreSQL.",
      bullets: [],
      techStack: ["nextjs", "postgresql"],
      links: {},
      source: "github",
      included: true,
      highlight: false,
      updatedAt: "2026-10-01T00:00:00Z",
    },
  ],
};

beforeEach(async () => {
  await getDb().jobs.put(job);
  await getDb().profile.put(profile);
});
afterEach(async () => {
  runTask.mockClear();
  await Promise.all([getDb().jobs.clear(), getDb().profile.clear(), getDb().jdAnalyses.clear()]);
});

describe("tailoredFor (background)", () => {
  it("applies the AI's honest changes and rejects the invented number", async () => {
    await updateSecrets({ aiKeys: { gemini: "test-key" } });
    const result = await tailoredFor(job.id, ["proj-1"]);
    expect(result.source).toBe("ai");
    expect(result.content.summaryChanged).toBe(true);
    expect(result.content.experience[0]?.bullets).toEqual([
      { text: "Reduced API latency by 30% using Redis caching", changed: false },
      { text: "Shipped payment dashboards in React and TypeScript", changed: true },
    ]);
    expect(result.content.projects[0]?.bullets.map((b) => b.text)).toEqual([
      "Built a Next.js job board",
      "Stored listings in PostgreSQL",
    ]);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toContain("80");
  });

  it("reorders locally without AI and rewrites nothing", async () => {
    const result = await tailoredFor(job.id, ["proj-1", "missing-project"]);
    expect(result.source).toBe("local");
    expect(runTask).not.toHaveBeenCalled();
    expect(result.content.skills.map((s) => s.id).slice(0, 2)).toEqual(["react", "typescript"]);
    expect(result.content.summaryChanged).toBe(false);
    expect(result.content.experience[0]?.bullets.every((b) => !b.changed)).toBe(true);
    expect(result.content.projects).toHaveLength(1);
    expect(result.issues).toEqual([]);
  });
});
