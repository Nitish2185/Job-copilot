import type { Job, Preferences } from "@job-copilot/shared";
import { describe, expect, it } from "vitest";
import {
  countedJobSkills,
  exclusionReason,
  experienceFit,
  experienceText,
  SHOW_ALL_EXPERIENCE,
  tooSenior,
  jobTypeOf,
  locationMatches,
  matchProfile,
  prefilterJob,
  titleMatch,
  type MatchProfile,
} from "@/lib/matching/prefilter";
import { emptyProfile } from "@/lib/profile/profile";
import { defaultPreferences } from "@/lib/profile/store";

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: "lever:acme:1",
    platform: "lever",
    source: "feed",
    company: { name: "Acme", token: "acme" },
    title: "Frontend Developer",
    locations: ["Bengaluru, India"],
    remote: "hybrid",
    countryCodes: ["IN"],
    url: "https://jobs.lever.co/acme/1",
    applyUrl: "https://jobs.lever.co/acme/1/apply",
    firstSeenAt: "2026-11-01T06:00:00Z",
    skills: ["javascript", "react", "typescript"],
    snippet: "Build our web app.",
    mode: "auto",
    dedupeKey: "acme|frontend developer|bengaluru",
    status: "new",
    ...overrides,
  };
}

function prefs(overrides: Partial<Preferences> = {}): Preferences {
  return { ...defaultPreferences("IN"), ...overrides };
}

const me: MatchProfile = {
  skills: new Set(["javascript", "react", "nodejs"]),
  totalYears: 4,
  desiredRoles: ["Frontend Developer"],
  maxExtraYears: SHOW_ALL_EXPERIENCE,
};

describe("prefilter score (spec 12.1)", () => {
  it("weighs skills 0.6, title 0.2 and experience 0.2", () => {
    // Skills: react in title counts double -> (2 + 1) / (2 + 1 + 1) = 0.75.
    // Title: full match = 1. Experience: not stated = 0.7.
    const result = prefilterJob(
      job({ title: "React Developer", skills: ["javascript", "react", "typescript"] }),
      { ...me, desiredRoles: ["React Developer"] },
      prefs(),
      40,
    );
    expect(result.score).toBe(Math.round(100 * (0.6 * 0.75 + 0.2 * 1 + 0.2 * 0.7)));
    expect(result.matchedSkills).toEqual(["react", "javascript"]);
    expect(result.missingSkills).toEqual(["typescript"]);
    expect(result.passed).toBe(true);
    expect(result.reasons[0]).toBe("Matches React, JavaScript");
  });

  it("fails jobs under the minimum score", () => {
    const result = prefilterJob(
      job({ title: "Data Engineer", skills: ["python", "spark", "airflow"], experienceMin: 8 }),
      me,
      prefs(),
      40,
    );
    expect(result.score).toBe(Math.round(100 * (0 + 0.2 * 0.5 + 0)));
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("Asks for 8+ years; you have less (4 years)");
  });

  it("counts at most 12 job skills, title skills first", () => {
    const skills = Array.from({ length: 20 }, (_, i) => `skill-${String(i).padStart(2, "0")}`);
    const counted = countedJobSkills({ title: "Go Developer", skills: [...skills, "go"] });
    expect(counted.skills).toHaveLength(12);
    expect(counted.skills[0]).toBe("go");
  });

  it("scores experience fit as the spec says", () => {
    expect(experienceFit(4, 3, 5)).toBe(1);
    expect(experienceFit(6, 3, 5)).toBe(1); // within max + 1
    expect(experienceFit(2.5, 3, 5)).toBe(0.5); // within 1 year below
    expect(experienceFit(1, 3, 5)).toBe(0);
    expect(experienceFit(4)).toBe(0.7); // not stated
    expect(experienceFit(9, 2, 4)).toBe(0.5); // more than asked
  });

  it("matches titles across spelling variants", () => {
    expect(titleMatch("Senior Front-End Engineer", ["Frontend Developer"])).toBe(1);
    expect(titleMatch("Backend Engineer (Go)", ["Backend Developer (Go)"])).toBe(1);
    expect(titleMatch("Full Stack Engineer", ["Frontend Developer"])).toBe(0.5);
    expect(titleMatch("Anything", [])).toBe(0.5);
  });
});

describe("hard filters", () => {
  it("excludes hidden companies, title keywords and closed jobs", () => {
    expect(exclusionReason(job(), prefs({ hiddenCompanies: ["ACME Inc."] }))).toBe(
      "Hidden company",
    );
    expect(
      exclusionReason(job({ title: "Sales Engineer" }), prefs({ excludeTitleKeywords: ["sales"] })),
    ).toBe("Title contains “sales”");
    expect(exclusionReason(job({ status: "closed" }), prefs())).toBe("Closed");
  });

  it("excludes job types the user did not choose, but keeps unknown types", () => {
    expect(jobTypeOf({ employmentType: "FullTime", title: "Dev" })).toBe("full_time");
    expect(jobTypeOf({ employmentType: "Part-time", title: "Dev" })).toBe("part_time");
    expect(jobTypeOf({ title: "Software Engineering Intern" })).toBe("internship");
    expect(jobTypeOf({ title: "Developer" })).toBeUndefined();
    expect(exclusionReason(job({ employmentType: "Contract" }), prefs())).toBe(
      "Job type you did not choose",
    );
    expect(exclusionReason(job(), prefs())).toBeUndefined();
  });

  it("filters by country, remote preference and city", () => {
    const remoteUs = job({ remote: "remote", countryCodes: ["US"], locations: ["Remote - US"] });
    expect(exclusionReason(remoteUs, prefs({ countries: ["IN"] }))).toBe(
      "Country you did not choose",
    );
    expect(
      exclusionReason(job({ countryCodes: [] }), prefs({ countries: ["IN"] })),
    ).toBeUndefined();
    expect(exclusionReason(job(), prefs({ remotePreference: "remote" }))).toBe("Not remote");

    const pune = prefs({ preferredLocations: ["Pune"] });
    expect(exclusionReason(job(), pune)).toBe("Not in your cities");
    expect(exclusionReason(job(), { ...pune, willingToRelocate: true })).toBeUndefined();
    expect(exclusionReason(job({ remote: "remote" }), pune)).toBeUndefined();
  });

  it("knows other names of a city", () => {
    expect(locationMatches("Bangalore, Karnataka", "Bengaluru")).toBe(true);
    expect(locationMatches("Navi Mumbai", "Mumbai")).toBe(true);
    expect(locationMatches("Pune", "Mumbai")).toBe(false);
  });

  it("marks excluded jobs as not passed with the reason", () => {
    const result = prefilterJob(job(), me, prefs({ hiddenCompanies: ["Acme"] }), 0);
    expect(result.passed).toBe(false);
    expect(result.excluded).toBe("Hidden company");
  });
});

describe("hiding jobs that ask for much more experience", () => {
  const junior: MatchProfile = { ...me, totalYears: 7 / 12, maxExtraYears: 1 };

  it("hides an 8+ years job for someone with 7 months, and says why", () => {
    const result = prefilterJob(job({ experienceMin: 8 }), junior, prefs(), 40);
    expect(result.excluded).toBe("Needs 8+ years; you have 7 months");
    expect(result.passed).toBe(false);
  });

  it("keeps jobs within about a year of the user's experience, and jobs that do not say", () => {
    expect(tooSenior({ experienceMin: 0 }, junior)).toBe(false);
    expect(tooSenior({ experienceMin: 1 }, junior)).toBe(false);
    expect(tooSenior({ experienceMin: 2 }, junior)).toBe(true);
    expect(tooSenior({}, junior)).toBe(false);
    expect(
      prefilterJob(job({ experienceMin: 1, experienceMax: 3 }), junior, prefs(), 0).excluded,
    ).toBeUndefined();
  });

  it("follows the setting: none extra, or show all", () => {
    expect(tooSenior({ experienceMin: 1 }, { totalYears: 7 / 12, maxExtraYears: 0 })).toBe(true);
    expect(
      tooSenior({ experienceMin: 10 }, { totalYears: 0, maxExtraYears: SHOW_ALL_EXPERIENCE }),
    ).toBe(false);
  });

  it("writes experience in months and years", () => {
    expect(experienceText(7 / 12)).toBe("7 months");
    expect(experienceText(1 / 12)).toBe("1 month");
    expect(experienceText(1)).toBe("1 year");
    expect(experienceText(40 / 12)).toBe("3 years 4 months");
  });
});

describe("experience rule before a profile exists", () => {
  it("hides nothing for experience until the profile has skills or experience", () => {
    const empty = emptyProfile(new Date("2026-11-03T00:00:00Z"));
    expect(matchProfile(empty, prefs(), 1).maxExtraYears).toBe(SHOW_ALL_EXPERIENCE);
    const junior = { ...empty, totalExperienceMonths: 7 };
    expect(matchProfile(junior, prefs(), 1).maxExtraYears).toBe(1);
  });
});
