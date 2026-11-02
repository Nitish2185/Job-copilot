import { describe, expect, it } from "vitest";
import { FeedIndexSchema, FeedJobSchema, type FeedJob } from "./feed";

const validJob: FeedJob = {
  id: "greenhouse:acme:4012345",
  platform: "greenhouse",
  company: { name: "Acme", token: "acme" },
  title: "Senior Backend Engineer (Go)",
  locations: ["Bengaluru, India"],
  remote: "hybrid",
  countryCodes: ["IN"],
  url: "https://acme.com/careers/4012345",
  applyUrl: "https://job-boards.greenhouse.io/acme/jobs/4012345",
  postedAt: "2026-10-30T09:15:00Z",
  firstSeenAt: "2026-11-02T06:00:00Z",
  skills: ["go", "kubernetes", "postgresql"],
  expMin: 4,
  expMax: 7,
  salary: { min: 3000000, max: 4500000, currency: "INR", period: "year" },
  employmentType: "Full-time",
  department: "Engineering",
  snippet: "We are looking for a backend engineer to build our payments platform.",
  descHash: "a".repeat(64),
};

describe("FeedJobSchema", () => {
  it("accepts a complete job", () => {
    expect(FeedJobSchema.parse(validJob)).toEqual(validJob);
  });

  it("accepts a job with only the required fields", () => {
    const {
      postedAt: _p,
      expMin: _a,
      expMax: _b,
      salary: _s,
      employmentType: _e,
      department: _d,
      ...minimal
    } = validJob;
    expect(FeedJobSchema.safeParse(minimal).success).toBe(true);
  });

  it("drops unknown fields so older extensions ignore new optional data", () => {
    const parsed = FeedJobSchema.parse({ ...validJob, futureField: 1 });
    expect(parsed).not.toHaveProperty("futureField");
  });

  it.each([
    ["applyUrl off the allowlist", { applyUrl: "https://acme.com/apply" }],
    ["applyUrl on a look-alike host", { applyUrl: "https://jobs.lever.co.evil.com/x" }],
    ["javascript: url", { url: "javascript:alert(1)" }],
    ["unknown platform", { platform: "naukri" }],
    ["malformed id", { id: "acme-123" }],
    ["lowercase country code", { countryCodes: ["in"] }],
    ["snippet over 300 chars", { snippet: "x".repeat(301) }],
    ["bad descHash", { descHash: "abc" }],
    ["timestamp with offset", { firstSeenAt: "2026-11-02T11:30:00+05:30" }],
  ])("rejects %s", (_label, patch) => {
    expect(FeedJobSchema.safeParse({ ...validJob, ...patch }).success).toBe(false);
  });
});

describe("FeedIndexSchema", () => {
  const index = {
    schemaVersion: 1,
    generatedAt: "2026-11-02T06:00:00Z",
    totalOpenJobs: 5234,
    companyCount: 142,
    skillsVersion: "2026-11-01",
    snapshot: { file: "snapshot.json", sha256: "b".repeat(64), count: 5234 },
    shards: [
      { date: "2026-11-02", file: "jobs/2026-11-02.json", count: 87, sha256: "c".repeat(64) },
    ],
    closedShards: [{ date: "2026-11-02", file: "closed/2026-11-02.json", count: 12 }],
  };

  it("accepts the example from the spec", () => {
    expect(FeedIndexSchema.safeParse(index).success).toBe(true);
  });

  it("still parses a future schema version so the extension can ask for an update", () => {
    expect(FeedIndexSchema.safeParse({ ...index, schemaVersion: 2 }).success).toBe(true);
  });

  it.each(["../secret.json", "jobs/../../secret.json", "/abs.json", "jobs/2026-11-02.txt"])(
    "rejects the file path %s",
    (file) => {
      const bad = { ...index, snapshot: { ...index.snapshot, file } };
      expect(FeedIndexSchema.safeParse(bad).success).toBe(false);
    },
  );
});
