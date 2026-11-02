import { describe, expect, it } from "vitest";
import { hostnameOf, isAutoSubmitHost, isAutoSubmitUrl } from "./hosts";

describe("isAutoSubmitUrl", () => {
  it.each([
    "https://boards.greenhouse.io/acme/jobs/123",
    "https://job-boards.greenhouse.io/acme/jobs/123",
    "https://jobs.lever.co/acme/abc/apply",
    "https://jobs.eu.lever.co/acme/abc",
    "https://jobs.ashbyhq.com/acme/abc/application",
    "https://apply.workable.com/acme/j/ABC123/",
    "https://jobs.smartrecruiters.com/Acme/123",
    "https://JOBS.LEVER.CO/acme",
  ])("accepts %s", (url) => {
    expect(isAutoSubmitUrl(url)).toBe(true);
  });

  it.each([
    "http://jobs.lever.co/acme", // not https
    "https://jobs.lever.co.evil.com/acme",
    "https://evil.com/?u=jobs.lever.co",
    "https://evil.com/jobs.lever.co/acme",
    "https://sub.jobs.lever.co/acme",
    "https://lever.co/acme",
    "https://www.naukri.com/job-listings-x",
    "https://in.indeed.com/viewjob?jk=1",
    "https://www.linkedin.com/jobs/view/1",
    "https://acme.wd5.myworkdayjobs.com/en-US/careers",
    "not a url",
    "",
  ])("rejects %s", (url) => {
    expect(isAutoSubmitUrl(url)).toBe(false);
  });
});

describe("isAutoSubmitHost", () => {
  it("matches hostnames exactly, ignoring case", () => {
    expect(isAutoSubmitHost("jobs.ashbyhq.com")).toBe(true);
    expect(isAutoSubmitHost("Jobs.AshbyHQ.com")).toBe(true);
    expect(isAutoSubmitHost("ashbyhq.com")).toBe(false);
    expect(isAutoSubmitHost("jobs.ashbyhq.com.")).toBe(false);
  });
});

describe("hostnameOf", () => {
  it("returns the lowercase hostname or null", () => {
    expect(hostnameOf("https://Boards.Greenhouse.io/acme")).toBe("boards.greenhouse.io");
    expect(hostnameOf("nope")).toBeNull();
  });
});
