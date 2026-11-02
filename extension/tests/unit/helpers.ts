import type { FeedJob, Job } from "@job-copilot/shared";

export function sampleJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "lever:acme:1",
    platform: "lever",
    source: "feed",
    company: { name: "Acme", token: "acme" },
    title: "Backend Engineer",
    locations: ["Bengaluru, India"],
    remote: "hybrid",
    countryCodes: ["IN"],
    url: "https://jobs.lever.co/acme/1",
    applyUrl: "https://jobs.lever.co/acme/1/apply",
    firstSeenAt: "2026-11-01T06:00:00Z",
    skills: ["go"],
    snippet: "Build things.",
    mode: "auto",
    dedupeKey: "acme|backend engineer|bengaluru india",
    status: "new",
    ...overrides,
  };
}

export function sampleFeedJob(overrides: Partial<FeedJob> = {}): FeedJob {
  return {
    id: "lever:acme:1",
    platform: "lever",
    company: { name: "Acme", token: "acme" },
    title: "Backend Engineer",
    locations: ["Bengaluru, India"],
    remote: "hybrid",
    countryCodes: ["IN"],
    url: "https://jobs.lever.co/acme/1",
    applyUrl: "https://jobs.lever.co/acme/1/apply",
    firstSeenAt: "2026-11-01T06:00:00Z",
    skills: ["go"],
    snippet: "Build things.",
    descHash: "a".repeat(64),
    ...overrides,
  };
}
