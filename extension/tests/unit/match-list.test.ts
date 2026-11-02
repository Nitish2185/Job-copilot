import type { Job, JobScore } from "@job-copilot/shared";
import { describe, expect, it } from "vitest";
import {
  defaultFilters,
  filterMatches,
  skillGaps,
  sortMatches,
  type MatchRow,
} from "@/lib/matching/matchList";

const now = new Date("2026-11-02T12:00:00Z");

function row(
  n: number,
  final: number | undefined,
  job: Partial<Job> = {},
  score: Partial<JobScore> = {},
): MatchRow {
  return {
    job: {
      id: `lever:acme:${String(n)}`,
      platform: "lever",
      source: "feed",
      company: { name: `Company ${String(n)}` },
      title: `Developer ${String(n)}`,
      locations: ["Bengaluru, India"],
      remote: "hybrid",
      countryCodes: ["IN"],
      url: "",
      applyUrl: "",
      firstSeenAt: `2026-11-0${String((n % 2) + 1)}T06:00:00Z`,
      skills: ["react"],
      snippet: "",
      mode: "auto",
      dedupeKey: String(n),
      status: "new",
      ...job,
    },
    ...(final !== undefined && {
      score: {
        jobId: `lever:acme:${String(n)}`,
        profileVersion: 1,
        prefilter: {
          score: final,
          matchedSkills: [],
          missingSkills: [],
          passed: true,
          reasons: [],
        },
        final,
        isEstimate: true,
        scoredAt: "2026-11-02T06:00:00Z",
        ...score,
      },
    }),
  };
}

describe("filterMatches", () => {
  const rows = [
    row(1, 90),
    row(2, 50),
    row(3, undefined),
    row(4, 80, { status: "hidden" }),
    row(
      5,
      95,
      {},
      {
        prefilter: {
          score: 95,
          matchedSkills: [],
          missingSkills: [],
          passed: false,
          reasons: [],
          excluded: "Hidden company",
        },
      },
    ),
  ];

  it("shows jobs at or above the threshold once the profile is set up", () => {
    const shown = filterMatches(rows, defaultFilters(60), now, true);
    expect(shown.map((r) => r.job.id)).toEqual(["lever:acme:1"]);
  });

  it("shows every open job with Show all, but never excluded or hidden ones", () => {
    const shown = filterMatches(rows, { ...defaultFilters(60), showAll: true }, now, true);
    expect(shown.map((r) => r.job.id)).toEqual(["lever:acme:1", "lever:acme:2", "lever:acme:3"]);
  });

  it("skips the threshold before the profile is set up", () => {
    expect(filterMatches(rows, defaultFilters(60), now, false)).toHaveLength(3);
  });

  it("filters by mode, country, remote, date, company, salary and status", () => {
    const more = [
      row(10, 70, { mode: "assist", countryCodes: ["US"], remote: "remote" }),
      row(11, 70, {
        salary: { min: 1, currency: "INR", period: "year" },
        firstSeenAt: "2026-10-01T00:00:00Z",
      }),
      row(12, 70, { company: { name: "Globex" }, status: "saved" }),
    ];
    const f = { ...defaultFilters(0), showAll: true };
    expect(filterMatches(more, { ...f, mode: "assist" }, now, true)).toHaveLength(1);
    expect(filterMatches(more, { ...f, country: "us" }, now, true)).toHaveLength(1);
    expect(filterMatches(more, { ...f, remote: "remote" }, now, true)).toHaveLength(1);
    expect(filterMatches(more, { ...f, postedWithinDays: 7 }, now, true)).toHaveLength(2);
    expect(filterMatches(more, { ...f, company: "glob" }, now, true)).toHaveLength(1);
    expect(filterMatches(more, { ...f, hasSalary: true }, now, true)).toHaveLength(1);
    expect(filterMatches(more, { ...f, status: "saved" }, now, true)).toHaveLength(1);
  });
});

describe("sortMatches", () => {
  it("sorts by score, date or company", () => {
    const rows = [row(1, 50), row(2, 90), row(3, undefined)];
    expect(sortMatches([...rows], "score").map((r) => r.score?.final)).toEqual([90, 50, undefined]);
    expect(sortMatches([...rows], "date")[0]?.job.id).toBe("lever:acme:1");
    expect(sortMatches([...rows], "company").map((r) => r.job.company.name)).toEqual([
      "Company 1",
      "Company 2",
      "Company 3",
    ]);
  });
});

describe("skillGaps", () => {
  it("counts missing skills and unmet must-haves once per job", () => {
    const missing = (ids: string[], mustHave: { skill: string; met: boolean }[] = []) => ({
      prefilter: { score: 70, matchedSkills: [], missingSkills: ids, passed: true, reasons: [] },
      ...(mustHave.length > 0 && {
        ai: {
          score: 70,
          verdict: "good" as const,
          mustHave,
          niceToHave: [],
          experienceFit: "fit" as const,
          locationFit: null,
          salaryFit: null,
          reasons: [],
          redFlags: [],
        },
      }),
    });
    const rows = [
      row(1, 80, {}, missing(["kubernetes", "aws"], [{ skill: "Kubernetes", met: false }])),
      row(
        2,
        70,
        {},
        missing(
          ["aws"],
          [
            { skill: "Terraform", met: false },
            { skill: "React", met: true },
          ],
        ),
      ),
      row(3, 60, {}, missing(["aws"])),
    ];
    expect(skillGaps(rows)).toEqual([
      { skill: "aws", jobs: 3 },
      { skill: "kubernetes", jobs: 1 },
      { skill: "terraform", jobs: 1 },
    ]);
  });
});
