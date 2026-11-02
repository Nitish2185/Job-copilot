import { describe, expect, it } from "vitest";
import { extractContacts } from "@/lib/ai/redact";
import type { ProfileDraft } from "@/lib/ai/tasks/extractProfile";
import { findAnswer, jaccard, newAnswer, normalizeQuestion } from "@/lib/answers/answerBank";
import {
  emptyProfile,
  nextVersion,
  profileFromDraft,
  suggestSkillYears,
  totalExperienceMonths,
} from "@/lib/profile/profile";

const now = new Date("2026-11-02T06:00:00Z");

const role = (
  startDate: string,
  endDate: string | null,
  title = "Engineer",
  bullets: string[] = [],
) => ({
  id: crypto.randomUUID(),
  company: "Acme",
  title,
  startDate,
  endDate,
  bullets,
  skills: [],
});

describe("totalExperienceMonths", () => {
  it("counts both end months", () => {
    expect(totalExperienceMonths([role("2020-06", "2022-06")], now)).toBe(25);
  });

  it("counts overlapping roles once and current roles until now", () => {
    const months = totalExperienceMonths([role("2022-07", null), role("2020-06", "2022-08")], now);
    expect(months).toBe(2026 * 12 + 10 - (2020 * 12 + 5) + 1);
  });

  it("ignores roles that end before they start", () => {
    expect(totalExperienceMonths([role("2022-01", "2021-01")], now)).toBe(0);
  });
});

describe("suggestSkillYears", () => {
  it("adds up the roles that mention a skill", () => {
    const years = suggestSkillYears(
      [
        role("2020-07", "2022-06", "Developer", ["Built REST APIs in Express and MongoDB"]),
        role("2022-07", "2024-06", "Engineer", ["Payment dashboards with React and Node.js"]),
      ],
      now,
    );
    expect(years.get("mongodb")).toBe(2);
    expect(years.get("react")).toBe(2);
    // "Express" alone is ambiguous, so only the second role counts for Node.js.
    expect(years.get("nodejs")).toBe(2);
  });
});

describe("profileFromDraft", () => {
  const draft: ProfileDraft = {
    headline: "Full-stack developer",
    summary: "Full-stack developer with 4 years of experience.",
    city: "Pune",
    country: "India",
    skills: [
      { name: "React" },
      { name: "Node.js", years: 4 },
      { name: "React.js" },
      { name: "Internal DSL" },
    ],
    experience: [
      {
        company: "Example Fintech",
        title: "Software Engineer",
        startDate: "2022-07",
        endDate: null,
        bullets: ["Built dashboards with React"],
      },
    ],
    education: [{ institution: "Example Institute", degree: "B.Tech", endYear: 2020 }],
    projects: [
      {
        name: "Job Board",
        description: "A job listing app",
        bullets: [],
        techStack: ["Next.js", "PostgreSQL"],
        repoUrl: "github.com/aarav-dev/job-board",
      },
    ],
    certifications: [],
    languages: [{ name: "English" }],
    achievements: [],
    uncertainFields: [],
  };
  const contacts = extractContacts("aarav.mehta@example.com +91 99999 01234 github.com/aarav-dev");

  it("builds a valid profile with canonical skills, contacts and totals", () => {
    const profile = profileFromDraft(draft, contacts, now);
    expect(profile.basics).toMatchObject({
      email: "aarav.mehta@example.com",
      phone: "+91 99999 01234",
      city: "Pune",
      country: "IN",
      githubUsername: "aarav-dev",
    });
    expect(profile.skills.map((s) => s.id)).toEqual(["react", "nodejs", "internal-dsl"]);
    expect(profile.skills.find((s) => s.id === "nodejs")?.years).toBe(4);
    expect(profile.skills.find((s) => s.id === "react")?.years).toBe(4.5);
    expect(profile.projects[0]).toMatchObject({
      techStack: ["nextjs", "postgresql"],
      links: { repo: "https://github.com/aarav-dev/job-board" },
      source: "resume",
      included: true,
    });
    expect(profile.totalExperienceMonths).toBe(53); // Jul 2022 to Nov 2026, both months included
  });

  it("bumps the version on save", () => {
    expect(nextVersion(emptyProfile(now), now).version).toBe(1);
  });
});

describe("answer bank", () => {
  it("normalizes questions", () => {
    expect(normalizeQuestion("  What is your Current CTC (in LPA)?* ")).toBe(
      "what is your current ctc in lpa",
    );
  });

  it("finds exact and near-identical questions, never pending AI answers", async () => {
    const entries = [
      await newAnswer(
        { question: "Notice period (in days)?", answer: "30", fieldType: "text", sensitive: true },
        now,
      ),
      await newAnswer(
        {
          question: "Why do you want to join us?",
          answer: "AI draft",
          fieldType: "textarea",
          sensitive: false,
          source: "ai_approved",
          status: "pending_approval",
        },
        now,
      ),
    ];
    expect((await findAnswer(entries, "Notice period in days", "text"))?.answer).toBe("30");
    expect(await findAnswer(entries, "Why do you want to join us", "textarea")).toBeUndefined();
    expect(jaccard("expected ctc in lpa", "expected ctc lpa")).toBeLessThan(0.9);
  });

  it("only reuses answers that fit the field", async () => {
    const entries = [
      await newAnswer(
        {
          question: "Willing to relocate?",
          answer: "Yes",
          fieldType: "radio",
          sensitive: true,
          options: ["Yes", "No"],
        },
        now,
      ),
    ];
    expect(await findAnswer(entries, "Willing to relocate?", "radio", ["Yes", "No"])).toBeDefined();
    expect(await findAnswer(entries, "Willing to relocate?", "radio", ["Y", "N"])).toBeUndefined();
  });
});
