import { describe, expect, it } from "vitest";
import { canonicalJobUrl, jobFromCard, jobFromPage } from "@/lib/jobs/fromPage";

const now = new Date("2026-11-02T06:00:00Z");

describe("jobFromPage", () => {
  it("builds a saved job with skills, experience, countries and a snippet", async () => {
    const job = await jobFromPage(
      {
        title: "Backend Developer",
        company: "Acme Technologies",
        locations: ["Pune, Maharashtra"],
        descriptionHtml: "<p>We need 3-5 years of Go and Kafka.</p><p>Hybrid role.</p>",
        url: "https://www.naukri.com/job-listings-backend-developer-123?src=jobsearch&utm_source=x",
        skills: ["Go", "Kafka"],
      },
      "naukri",
      now,
    );
    expect(job).toMatchObject({
      platform: "naukri",
      source: "saved_from_page",
      status: "saved",
      url: "https://www.naukri.com/job-listings-backend-developer-123",
      countryCodes: ["IN"],
      experienceMin: 3,
      experienceMax: 5,
      mode: "assist",
    });
    expect(job.id).toMatch(/^manual:[0-9a-f]{32}$/);
    expect(job.skills).toContain("go");
    expect(job.skills).toContain("kafka");
    expect(job.snippet).toContain("Go and Kafka");
    expect(job.description?.html).toContain("<p>");
  });

  it("turns an Auto company-site link into an Auto job", async () => {
    const job = await jobFromPage(
      {
        title: "Engineer",
        company: "Acme",
        locations: [],
        descriptionHtml: "",
        url: "https://www.naukri.com/job-listings-1",
        externalApplyUrl: "https://jobs.lever.co/acme/1",
      },
      "naukri",
      now,
    );
    expect(job).toMatchObject({
      mode: "auto",
      applyUrl: "https://jobs.lever.co/acme/1",
      externalApplyUrl: "https://jobs.lever.co/acme/1",
    });
  });

  it("keeps non-Auto company links as Assist", async () => {
    const job = await jobFromPage(
      {
        title: "Engineer",
        company: "Acme",
        locations: [],
        descriptionHtml: "",
        url: "https://in.indeed.com/viewjob?jk=1",
        externalApplyUrl: "https://careers.acme.com/1",
      },
      "indeed",
      now,
    );
    expect(job).toMatchObject({ mode: "assist", applyUrl: "https://in.indeed.com/viewjob?jk=1" });
  });
});

describe("helpers", () => {
  it("strips tracking parameters and hashes", () => {
    expect(canonicalJobUrl("https://x.com/job?id=1&utm_medium=a&trk=b#apply")).toBe(
      "https://x.com/job?id=1",
    );
  });

  it("makes card jobs from the title alone", () => {
    const card = jobFromCard(
      { title: "React Developer", company: "Acme", location: "Bengaluru", url: "https://x/1" },
      "linkedin",
      now,
    );
    expect(card.skills).toContain("react");
    expect(card.countryCodes).toEqual(["IN"]);
  });
});
