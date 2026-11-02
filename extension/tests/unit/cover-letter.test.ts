import type { Profile, Project } from "@job-copilot/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { writeCoverLetterTask } from "@/lib/ai/tasks/writeCoverLetter";
import { JobCopilotDB } from "@/lib/db/db";
import { emptyProfile } from "@/lib/profile/profile";
import {
  coverLetterFileName,
  saveCoverLetter,
  validateCoverLetter,
} from "@/lib/resume/coverLetter";

const project: Project = {
  id: "proj-1",
  name: "Job Board",
  description: "A job listing app built with Next.js and PostgreSQL.",
  bullets: ["Search across 5,000 listings"],
  techStack: ["nextjs", "postgresql"],
  links: {},
  source: "github",
  included: true,
  highlight: false,
  updatedAt: "2026-10-01T00:00:00Z",
};

const profile: Profile = {
  ...emptyProfile(new Date("2026-11-02T00:00:00Z")),
  summary: "Full-stack developer with 4 years of experience building React and Node.js apps.",
  skills: [
    { id: "react", displayName: "React", source: "resume" },
    { id: "nodejs", displayName: "Node.js", source: "resume" },
  ],
  experience: [
    {
      id: "exp-1",
      company: "Example Fintech",
      title: "Software Engineer",
      startDate: "2022-07",
      endDate: null,
      bullets: ["Reduced API latency by 30% using caching"],
      skills: [],
    },
  ],
  totalExperienceMonths: 53,
  projects: [project],
};

const filler = (n: number) => Array.from({ length: n }, () => "helpful").join(" ");

describe("validateCoverLetter", () => {
  it("keeps honest sentences and removes ones with invented facts", () => {
    const text = [
      "Dear Acme hiring team,",
      `I build React and Node.js apps and cut API latency by 30% at Example Fintech. ${filler(120)}.`,
      "I also led a Kubernetes migration at Google for 2 million users. My Job Board project searches 5,000 listings with PostgreSQL.",
      "Kind regards,",
    ].join("\n\n");
    const result = validateCoverLetter(text, profile, [project], "Acme");
    expect(result.text).toContain("cut API latency by 30%");
    expect(result.text).toContain("searches 5,000 listings with PostgreSQL");
    expect(result.text).not.toContain("Kubernetes");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatch(/Removed a sentence that adds skills .*kubernetes/);
    expect(result.issues[0]).toMatch(/google/);
  });

  it("notes letters outside 150-250 words", () => {
    const result = validateCoverLetter(
      "Dear Acme hiring team, I build React apps.",
      profile,
      [],
      "Acme",
    );
    expect(result.issues.at(-1)).toContain("150-250 reads best");
  });

  it("asks for a letter to the company's hiring team with no placeholders", () => {
    const messages = writeCoverLetterTask.buildMessages({
      job: { title: "Dev", company: "Acme", mustHave: [], keywords: [], responsibilities: "" },
      candidate: {
        headline: "",
        summary: "",
        totalYears: 4,
        skills: [],
        recentRoles: [],
        projects: [],
      },
    });
    expect(messages[0]?.content).toContain("addressed to the Acme hiring team");
    expect(messages[0]?.content).toContain("No placeholders");
  });
});

describe("saveCoverLetter", () => {
  let db: JobCopilotDB;
  beforeEach(async () => {
    db = new JobCopilotDB(`letters-${crypto.randomUUID()}`);
    await db.open();
  });

  it("keeps one letter per job", async () => {
    await saveCoverLetter(db, { jobId: "j1", text: "First", issues: [] });
    const second = await saveCoverLetter(db, { jobId: "j1", text: "Second", issues: ["x"] });
    const letters = await db.coverLetters.where("jobId").equals("j1").toArray();
    expect(letters).toEqual([second]);
    expect(second.validation.passed).toBe(false);
  });

  it("names the PDF like the resume", () => {
    expect(coverLetterFileName("Aarav_Mehta_Resume_Acme.pdf")).toBe(
      "Aarav_Mehta_Cover_Letter_Acme.pdf",
    );
  });
});
