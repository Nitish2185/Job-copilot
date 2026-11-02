import type { Job } from "@job-copilot/shared";
import { beforeEach, describe, expect, it } from "vitest";
import ashbyFixture from "../../../crawler/testdata/fixtures/ashby_board.json";
import greenhouseFixture from "../../../crawler/testdata/fixtures/greenhouse_jobs.json";
import leverFixture from "../../../crawler/testdata/fixtures/lever_postings.json";
import srDetailFixture from "../../../crawler/testdata/fixtures/smartrecruiters_posting_detail.json";
import { JobCopilotDB } from "@/lib/db/db";
import {
  clearBoardCache,
  descriptionSource,
  ensureDescription,
  textToHtml,
  type DescriptionDeps,
} from "@/lib/jobs/description";

const now = new Date("2026-11-02T06:00:00Z");

function job(id: string, overrides: Partial<Job> = {}): Job {
  return {
    id,
    platform: id.split(":")[0] as Job["platform"],
    source: "feed",
    company: { name: "Acme", token: id.split(":")[1] ?? "" },
    title: "Engineer",
    locations: [],
    remote: "unknown",
    countryCodes: [],
    url: "https://example.com/job",
    applyUrl: "https://example.com/apply",
    firstSeenAt: "2026-11-01T06:00:00Z",
    skills: [],
    snippet: "Short snippet.",
    mode: "auto",
    dedupeKey: id,
    status: "new",
    ...overrides,
  };
}

function deps(routes: Record<string, unknown>, log: string[] = []): DescriptionDeps {
  return {
    fetch: (input) => {
      const url = input instanceof Request ? input.url : input.toString();
      log.push(url);
      return Promise.resolve(
        url in routes ? Response.json(routes[url]) : new Response("not found", { status: 404 }),
      );
    },
    // Stand-in for DOMPurify: drops <script> blocks.
    sanitize: (html) => html.replace(/<script[\s\S]*?<\/script>/gi, ""),
    now: () => now,
  };
}

let db: JobCopilotDB;
beforeEach(async () => {
  clearBoardCache();
  db = new JobCopilotDB(`desc-${crypto.randomUUID()}`);
  await db.open();
});

describe("descriptionSource", () => {
  it("reads the board from the job ID and spots Lever EU jobs", () => {
    expect(descriptionSource(job("lever:acme:abc"))?.board).toMatchObject({
      platform: "lever",
      token: "acme",
    });
    expect(
      descriptionSource(job("lever:acme:abc", { url: "https://jobs.eu.lever.co/acme/abc" }))?.board
        .variant,
    ).toBe("eu");
    expect(descriptionSource(job("manual:abc"))).toBeUndefined();
    expect(descriptionSource(job("naukri:x:1"))).toBeUndefined();
  });
});

describe("ensureDescription", () => {
  it("fetches a Greenhouse job, decodes and sanitizes it, and stores it", async () => {
    const gh = greenhouseFixture.jobs[0];
    if (!gh) throw new Error("fixture");
    const target = job(`greenhouse:gitlab:${String(gh.id)}`);
    await db.jobs.put(target);
    const routes = {
      [`https://boards-api.greenhouse.io/v1/boards/gitlab/jobs/${String(gh.id)}`]: {
        ...gh,
        content: `${gh.content}&lt;script&gt;alert(1)&lt;/script&gt;`,
      },
    };
    const description = await ensureDescription(db, deps(routes), target);
    expect(description.html).toContain("<p>");
    expect(description.html).not.toContain("<script");
    expect(description.text.length).toBeGreaterThan(100);
    expect((await db.jobs.get(target.id))?.description?.fetchedAt).toBe("2026-11-02T06:00:00Z");
  });

  it("uses the Lever single-posting endpoint", async () => {
    const posting = leverFixture[0];
    if (!posting) throw new Error("fixture");
    const target = job(`lever:palantir:${posting.id}`);
    await db.jobs.put(target);
    const description = await ensureDescription(
      db,
      deps({ [`https://api.lever.co/v0/postings/palantir/${posting.id}`]: posting }),
      target,
    );
    expect(description.text).toContain("Palantir");
  });

  it("caches an Ashby board for an hour and picks the job", async () => {
    const first = ashbyFixture.jobs[0];
    const second = ashbyFixture.jobs[1];
    if (!first || !second) throw new Error("fixture");
    const log: string[] = [];
    const d = deps(
      {
        "https://api.ashbyhq.com/posting-api/job-board/acme?includeCompensation=true": ashbyFixture,
      },
      log,
    );
    for (const id of [first.id, second.id]) {
      const target = job(`ashby:acme:${id}`);
      await db.jobs.put(target);
      expect((await ensureDescription(db, d, target)).text.length).toBeGreaterThan(0);
    }
    expect(log).toHaveLength(1);
  });

  it("turns SmartRecruiters text sections into paragraphs", async () => {
    const target = job(`smartrecruiters:acme:${srDetailFixture.id}`);
    await db.jobs.put(target);
    const description = await ensureDescription(
      db,
      deps({
        [`https://api.smartrecruiters.com/v1/companies/acme/postings/${srDetailFixture.id}`]:
          srDetailFixture,
      }),
      target,
    );
    expect(description.html.startsWith("<p>")).toBe(true);
  });

  it("reuses a fresh description and explains missing jobs", async () => {
    const stored = job("lever:acme:gone", {
      description: { html: "<p>Saved</p>", text: "Saved", fetchedAt: "2026-11-01T06:00:00Z" },
    });
    const log: string[] = [];
    expect((await ensureDescription(db, deps({}, log), stored)).text).toBe("Saved");
    expect(log).toHaveLength(0);
    await expect(ensureDescription(db, deps({}), stored, { refresh: true })).rejects.toThrow(
      "no longer on the company's board",
    );
    await expect(ensureDescription(db, deps({}), job("manual:1"))).rejects.toThrow("snippet");
  });

  it("escapes text when building paragraphs", () => {
    expect(textToHtml("a < b\n\nSecond")).toBe("<p>a &#60; b</p><p>Second</p>");
  });
});
