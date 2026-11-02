// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { ASSIST_ADAPTERS, GENERIC_ADAPTER, searchCards } from "@/lib/apply/adapters/assist";
import { readJsonLdJob } from "@/lib/apply/adapters/jobFromPage";

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "JobPosting",
  title: "Senior React Developer",
  hiringOrganization: { "@type": "Organization", name: "Fixture Corp" },
  jobLocation: [
    {
      "@type": "Place",
      address: { addressLocality: "Bengaluru", addressRegion: "Karnataka", addressCountry: "IN" },
    },
  ],
  description: "<p>Build React apps.</p>",
  datePosted: "2026-10-30",
  employmentType: "FULL_TIME",
  baseSalary: {
    "@type": "MonetaryAmount",
    currency: "INR",
    value: { minValue: 1800000, maxValue: 2400000, unitText: "YEAR" },
  },
};

describe("schema.org JobPosting", () => {
  it("reads title, company, places, salary and type, also inside @graph", () => {
    document.head.innerHTML = `<script type="application/ld+json">${JSON.stringify({ "@graph": [{ "@type": "WebPage" }, JSON_LD] })}</script>`;
    expect(readJsonLdJob(document)).toMatchObject({
      title: "Senior React Developer",
      company: "Fixture Corp",
      locations: ["Bengaluru, Karnataka, IN"],
      descriptionHtml: "<p>Build React apps.</p>",
      postedAt: "2026-10-30",
      employmentType: "FULL_TIME",
      salary: { currency: "INR", period: "year", min: 1800000, max: 2400000 },
    });
  });

  it("ignores broken JSON and other types, and knows remote jobs", () => {
    document.head.innerHTML = `
      <script type="application/ld+json">{ not json</script>
      <script type="application/ld+json">${JSON.stringify({ ...JSON_LD, jobLocation: undefined, jobLocationType: "TELECOMMUTE" })}</script>`;
    expect(readJsonLdJob(document)).toMatchObject({ locations: ["Remote"], remote: true });
    document.head.innerHTML =
      '<script type="application/ld+json">{"@type":"Organization","name":"X"}</script>';
    expect(readJsonLdJob(document)).toBeUndefined();
  });
});

describe("Naukri", () => {
  const naukri = ASSIST_ADAPTERS.naukri;
  it("reads a job page and its company-site link", () => {
    document.body.innerHTML = `
      <h1 class="styles_jd-header-title__rZwM1">Backend Developer</h1>
      <div class="styles_jd-header-comp-name__MvqAI"><a href="/acme-jobs">Acme Technologies</a></div>
      <span class="styles_jhc__location__W_pVs"><a>Pune</a></span>
      <section class="styles_job-desc-container__txpYf"><p>Go and Kafka.</p></section>
      <div class="styles_key-skill__GIPn_"><a>Go</a><a>Kafka</a></div>
      <button id="company-site-button" data-href="https://jobs.lever.co/acme/123">Apply on company site</button>`;
    expect(naukri.readJob(document)).toMatchObject({
      title: "Backend Developer",
      company: "Acme Technologies",
      locations: ["Pune"],
      skills: ["Go", "Kafka"],
      externalApplyUrl: "https://jobs.lever.co/acme/123",
    });
  });

  it("detects signed-in and signed-out headers", () => {
    document.body.innerHTML = '<a id="login_Layer" title="Jobseeker Login">Login</a>';
    expect(naukri.isLoggedIn?.(document)).toBe(false);
    document.body.innerHTML = '<div class="nI-gNb-drawer__icon"></div>';
    expect(naukri.isLoggedIn?.(document)).toBe(true);
    document.body.innerHTML = "<div></div>";
    expect(naukri.isLoggedIn?.(document)).toBe("unknown");
  });
});

describe("search cards for badges", () => {
  it("reads LinkedIn guest cards (structure as on the public search page)", () => {
    document.body.innerHTML = `<ul><li>
      <div class="base-card relative w-full base-card--link base-search-card base-search-card--link job-search-card">
        <a class="base-card__full-link" href="https://in.linkedin.com/jobs/view/react-js-developer-at-acme-4485472415"></a>
        <div class="base-search-card__info">
          <h3 class="base-search-card__title">React JS Developer</h3>
          <h4 class="base-search-card__subtitle"><a>Acme</a></h4>
          <span class="job-search-card__location">Bengaluru, Karnataka, India</span>
        </div></div></li></ul>`;
    const [card] = searchCards(document, ASSIST_ADAPTERS.linkedin.selectors);
    expect(card).toMatchObject({
      title: "React JS Developer",
      company: "Acme",
      location: "Bengaluru, Karnataka, India",
      url: "https://in.linkedin.com/jobs/view/react-js-developer-at-acme-4485472415",
    });
  });

  it("reads Indeed cards", () => {
    document.body.innerHTML = `
      <div class="job_seen_beacon"><h2 class="jobTitle"><a data-jk="abc" href="/viewjob?jk=abc"><span title="Frontend Engineer">Frontend Engineer</span></a></h2>
        <span data-testid="company-name">Globex</span><div data-testid="text-location">Remote</div></div>`;
    expect(searchCards(document, ASSIST_ADAPTERS.indeed.selectors)).toMatchObject([
      { title: "Frontend Engineer", company: "Globex", location: "Remote" },
    ]);
  });
});

describe("confirmation and errors", () => {
  it("detects confirmation on each site", () => {
    document.body.innerHTML =
      '<div data-automation-id="congratulationsPopup">Thanks! Your application was submitted.</div>';
    expect(ASSIST_ADAPTERS.workday.detectConfirmation(document).confirmed).toBe(true);
    document.body.innerHTML = "<h2>Your application was sent to Acme!</h2>";
    expect(ASSIST_ADAPTERS.linkedin.detectConfirmation(document).confirmed).toBe(true);
    document.body.innerHTML = "<p>Your application has been submitted</p>";
    expect(ASSIST_ADAPTERS.indeed.detectConfirmation(document).confirmed).toBe(true);
    document.body.innerHTML = "<p>Apply now</p>";
    expect(GENERIC_ADAPTER.detectConfirmation(document).confirmed).toBe(false);
  });

  it("never offers a submit control on Assist sites", () => {
    for (const adapter of [...Object.values(ASSIST_ADAPTERS), GENERIC_ADAPTER]) {
      expect("findSubmitControl" in adapter).toBe(false);
      expect(adapter.mode).toBe("assist");
    }
  });
});
