import { describe, expect, it } from "vitest";
import { resolveMode } from "@/lib/apply/mode";

describe("resolveMode (spec 16.1)", () => {
  it.each([
    ["https://boards.greenhouse.io/acme/jobs/123", "greenhouse"],
    ["https://job-boards.greenhouse.io/embed/job_app?for=acme&token=1", "greenhouse"],
    ["https://jobs.lever.co/acme/abc/apply", "lever"],
    ["https://jobs.eu.lever.co/acme/abc/apply", "lever"],
    ["https://jobs.ashbyhq.com/acme/abc/application", "ashby"],
    ["https://apply.workable.com/acme/j/ABC123/apply/", "workable"],
    ["https://jobs.smartrecruiters.com/Acme/744000159074300", "smartrecruiters"],
    ["https://JOBS.LEVER.CO/acme/abc", "lever"],
  ])("%s is Auto with the %s adapter", (url, adapterId) => {
    expect(resolveMode(url)).toEqual({ mode: "auto", adapterId });
  });

  it.each([
    "https://jobs.lever.co.evil.com/acme/abc",
    // A trailing dot is a different hostname string; the submit guard would refuse it too.
    "https://jobs.lever.co./acme/abc",
    "https://evil.com/?u=jobs.lever.co",
    "https://evil.com/jobs.lever.co/apply",
    "https://api.lever.co/v0/postings/acme",
    "https://careers.jobs.lever.co/acme",
    "https://greenhouse.io/acme",
    "https://www.greenhouse.io/careers",
    "https://jobs.ashbyhq.com@evil.com/acme",
    "http://jobs.lever.co/acme/abc",
    "https://boards.greenhouse.io.attacker.net/acme",
    "https://xn--jobs-lever-co.evil.com/",
    "not a url",
  ])("%s is never Auto", (url) => {
    expect(resolveMode(url).mode).toBe("assist");
  });

  it.each([
    ["https://www.naukri.com/job-listings-123", "naukri"],
    ["https://naukri.com/mnjuser/profile", "naukri"],
    ["https://in.indeed.com/viewjob?jk=1", "indeed"],
    ["https://smartapply.indeed.com/beta/indeedapply/form/questions/1", "indeed"],
    ["https://www.linkedin.com/jobs/view/123", "linkedin"],
    ["https://acme.wd1.myworkdayjobs.com/en-US/careers/job/x/apply", "workday"],
    ["https://wd3.myworkdaysite.com/recruiting/acme/careers", "workday"],
    ["https://indeed.com.evil.io/viewjob", "generic"],
    ["https://notnaukri.com/jobs", "generic"],
    ["https://careers.example.com/apply", "generic"],
    ["https://wellfound.com/jobs/123", "generic"],
  ])("%s is Assist with the %s adapter", (url, adapterId) => {
    expect(resolveMode(url)).toEqual({ mode: "assist", adapterId });
  });
});
