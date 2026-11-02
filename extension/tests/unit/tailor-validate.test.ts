import type { Profile, Project } from "@job-copilot/shared";
import { describe, expect, it } from "vitest";
import { emptyProfile } from "@/lib/profile/profile";
import { applyTailoring, type TailorChanges } from "@/lib/resume/tailor";
import {
  extractNumbers,
  knownNames,
  newNumbers,
  newSkills,
  unknownNames,
} from "@/lib/resume/validate";

const project: Project = {
  id: "proj-1",
  name: "Job Board",
  description: "A job listing app built with Next.js and PostgreSQL, used by 1,200 students.",
  bullets: ["Search across 5,000 listings with PostgreSQL full-text search"],
  techStack: ["nextjs", "postgresql", "typescript"],
  links: {},
  source: "github",
  included: true,
  highlight: false,
  updatedAt: "2026-10-01T00:00:00Z",
};

const profile: Profile = {
  ...emptyProfile(new Date("2026-11-02T00:00:00Z")),
  headline: "Full-stack developer",
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
      company: "Example Fintech Pvt Ltd",
      title: "Software Engineer",
      startDate: "2022-07",
      endDate: null,
      bullets: [
        "Built payment dashboards with React, TypeScript and Node.js",
        "Reduced API latency by 30% using Redis caching",
      ],
      skills: ["react", "typescript", "nodejs", "redis"],
    },
  ],
  totalExperienceMonths: 53,
  projects: [project],
  certifications: [{ id: "c1", name: "AWS Certified Cloud Practitioner" }],
};

function changes(overrides: Partial<TailorChanges> = {}): TailorChanges {
  return {
    summary: "",
    skillsOrder: [],
    experienceRewrites: [],
    experienceBulletOrder: [],
    projectBullets: [],
    keywordsTargeted: [],
    ...overrides,
  };
}

describe("validator building blocks", () => {
  it("finds numbers in common formats", () => {
    expect(
      extractNumbers("Cut costs 30% for 1,200 users in 12,00,000 rows, 3.5x faster, 4+ years"),
    ).toEqual(["30", "1200", "1200000", "3.5", "4"]);
    expect(newNumbers("Served 2,000 users", ["Served 1,200 users"])).toEqual(["2000"]);
  });

  it("finds skills that were not in the profile, counting implied skills as known", () => {
    expect(newSkills("Built with React and Kubernetes", new Set(["react", "javascript"]))).toEqual([
      "kubernetes",
    ]);
  });

  it("spots employers and certifications that are not in the profile", () => {
    const known = knownNames(profile);
    expect(
      unknownNames("Built tools used at Google", known, ["AWS Certified Cloud Practitioner"]),
    ).toEqual(["google"]);
    expect(unknownNames("Deployed on Amazon Web Services", known, [])).toEqual([]);
    expect(unknownNames("Worked with Initech Solutions", known, [])).toEqual(["Initech Solutions"]);
    expect(
      unknownNames("Holds a Kubernetes certification", known, ["AWS Certified Cloud Practitioner"]),
    ).toEqual(["a certification"]);
    expect(
      unknownNames("AWS Certified Cloud Practitioner", known, ["AWS Certified Cloud Practitioner"]),
    ).toEqual([]);
  });
});

describe("applyTailoring", () => {
  it("accepts honest rewrites and records what changed", () => {
    const { content, issues } = applyTailoring(
      profile,
      [project],
      changes({
        summary: "Full-stack developer with 4 years of React, TypeScript and Node.js experience.",
        skillsOrder: ["typescript", "react", "nodejs"],
        experienceRewrites: [
          { experienceId: "exp-1", bulletIndex: 1, text: "Cut API latency 30% with Redis caching" },
        ],
        experienceBulletOrder: [{ experienceId: "exp-1", order: [1, 0] }],
        projectBullets: [
          {
            projectId: "proj-1",
            bullets: [
              "Built a Next.js job board used by 1,200 students",
              "Searched 5,000 listings with PostgreSQL full-text search",
            ],
          },
        ],
        keywordsTargeted: ["React", "TypeScript"],
      }),
    );
    expect(issues).toEqual([]);
    expect(content.summaryChanged).toBe(true);
    expect(content.skills.map((s) => s.id)).toEqual(["typescript", "react", "nodejs"]);
    expect(content.experience[0]?.bullets).toEqual([
      { text: "Cut API latency 30% with Redis caching", changed: true },
      { text: "Built payment dashboards with React, TypeScript and Node.js", changed: false },
    ]);
    expect(content.projects[0]?.bullets.every((b) => b.changed)).toBe(true);
  });

  it("drops invented skills, numbers, employers and certifications and keeps the originals", () => {
    const { content, issues } = applyTailoring(
      profile,
      [project],
      changes({
        summary:
          "Developer with 9 years at Google, AWS Certified Solutions Architect, Kubernetes expert.",
        skillsOrder: ["react", "kubernetes"],
        experienceRewrites: [
          { experienceId: "exp-1", bulletIndex: 1, text: "Reduced API latency by 65% using Redis" },
          {
            experienceId: "exp-1",
            bulletIndex: 0,
            text: "Built dashboards with React and GraphQL",
          },
          { experienceId: "exp-9", bulletIndex: 0, text: "Invented job" },
        ],
        experienceBulletOrder: [{ experienceId: "exp-1", order: [0, 0, 1] }],
        projectBullets: [
          {
            projectId: "proj-1",
            bullets: ["Scaled to 50,000 users on Kubernetes", "Built with Next.js and PostgreSQL"],
          },
        ],
      }),
    );
    expect(content.summary).toBe(profile.summary);
    expect(content.skills.map((s) => s.id)).toEqual(["react"]);
    expect(content.experience[0]?.bullets.map((b) => b.text)).toEqual(
      profile.experience[0]?.bullets,
    );
    // The bad project bullet falls back to the original one at that position.
    expect(content.projects[0]?.bullets.map((b) => b.text)).toEqual([
      "Search across 5,000 listings with PostgreSQL full-text search",
      "Built with Next.js and PostgreSQL",
    ]);
    expect(issues.join("\n")).toMatch(/Summary .*numbers.*9/);
    expect(issues.join("\n")).toMatch(/google/);
    expect(issues.join("\n")).toMatch(/kubernetes/);
    expect(issues.join("\n")).toMatch(/65/);
    expect(issues.join("\n")).toMatch(/graphql/);
    expect(issues.join("\n")).toMatch(/not in your profile; it was ignored/);
    expect(issues.join("\n")).toMatch(/bullet order/);
  });

  it("enforces word limits", () => {
    const long = Array.from({ length: 70 }, () => "word").join(" ");
    const { content, issues } = applyTailoring(profile, [], changes({ summary: long }));
    expect(content.summary).toBe(profile.summary);
    expect(issues[0]).toContain("70 words (limit 60)");
  });
});
