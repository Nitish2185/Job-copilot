import { describe, expect, it } from "vitest";
import {
  AUTO_APPLY_LIMITS,
  AUTO_SUBMIT_HOSTS,
  FEED_BASE_URL,
  GITHUB_OWNER,
  GITHUB_REPO,
  REPO_URL,
} from "./config";

describe("config", () => {
  it("allows auto-submit only on the seven public ATS hosts from the spec", () => {
    expect([...AUTO_SUBMIT_HOSTS].sort()).toEqual(
      [
        "apply.workable.com",
        "boards.greenhouse.io",
        "job-boards.greenhouse.io",
        "jobs.ashbyhq.com",
        "jobs.eu.lever.co",
        "jobs.lever.co",
        "jobs.smartrecruiters.com",
      ].sort(),
    );
  });

  it("keeps every allowlisted host lowercase with no scheme, path or port", () => {
    for (const host of AUTO_SUBMIT_HOSTS) {
      expect(host).toMatch(/^[a-z0-9.-]+$/);
    }
  });

  it("derives repository and feed URLs from the owner and repo", () => {
    expect(REPO_URL).toBe(`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`);
    expect(FEED_BASE_URL).toBe(
      `https://${GITHUB_OWNER.toLowerCase()}.github.io/${GITHUB_REPO}/feed/`,
    );
    expect(FEED_BASE_URL.endsWith("/")).toBe(true);
  });

  it("matches the politeness limits from spec 2.4", () => {
    expect(AUTO_APPLY_LIMITS.pauseSecondsDefault).toBe(90);
    expect(AUTO_APPLY_LIMITS.pauseSecondsMin).toBe(30);
    expect(AUTO_APPLY_LIMITS.dailyCapDefault).toBe(20);
    expect(AUTO_APPLY_LIMITS.dailyCapMax).toBe(50);
    expect(AUTO_APPLY_LIMITS.perCompanyCapDefault).toBe(2);
    expect(AUTO_APPLY_LIMITS.perCompanyWindowDaysDefault).toBe(30);
  });
});
