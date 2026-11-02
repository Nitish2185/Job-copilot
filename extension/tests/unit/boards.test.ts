import { beforeEach, describe, expect, it } from "vitest";
import leverFixture from "../../../crawler/testdata/fixtures/lever_postings.json";
import srDetailFixture from "../../../crawler/testdata/fixtures/smartrecruiters_posting_detail.json";
import srListFixture from "../../../crawler/testdata/fixtures/smartrecruiters_postings.json";
import { JobCopilotDB } from "@/lib/db/db";
import { addCompanyFromUrl, syncBoards, type BoardDeps } from "@/lib/sources/boards";

/** Serves JSON by exact URL and records requests. */
function fakeFetch(routes: Map<string, unknown>, log: string[]): typeof fetch {
  return (input) => {
    const url = input instanceof Request ? input.url : input.toString();
    log.push(url);
    if (!routes.has(url)) return Promise.resolve(new Response("not found", { status: 404 }));
    return Promise.resolve(new Response(JSON.stringify(routes.get(url)), { status: 200 }));
  };
}

const LEVER = "https://api.lever.co/v0/postings/palantir?mode=json";
const SR_LIST =
  "https://api.smartrecruiters.com/v1/companies/BoschGroup/postings?limit=100&offset=0";
const SR_DETAIL =
  "https://api.smartrecruiters.com/v1/companies/BoschGroup/postings/744000159074300";

let db: JobCopilotDB;
let routes: Map<string, unknown>;
let log: string[];
let deps: BoardDeps;
let n = 0;

beforeEach(() => {
  db = new JobCopilotDB(`boards-${String(++n)}`);
  routes = new Map<string, unknown>([
    [LEVER, leverFixture],
    [SR_LIST, srListFixture],
    [SR_DETAIL, srDetailFixture],
  ]);
  log = [];
  deps = { db, fetch: fakeFetch(routes, log), now: () => new Date("2026-11-02T08:00:00Z") };
});

describe("addCompanyFromUrl", () => {
  it("detects the board, saves the company and its jobs", async () => {
    const result = await addCompanyFromUrl(
      deps,
      "https://jobs.lever.co/palantir/2bc07b65-3f3a-4565-8d7c-d015bed92166",
    );
    expect(result).toMatchObject({
      ok: true,
      jobs: 3,
      company: { id: "lever:palantir", name: "Palantir", lastStatus: "ok" },
    });
    const jobs = await db.jobs.toArray();
    expect(jobs).toHaveLength(3);
    expect(jobs[0]).toMatchObject({
      source: "personal_board",
      mode: "auto",
      status: "new",
      firstSeenAt: "2026-11-02T08:00:00.000Z",
    });
  });

  it("explains which platforms are supported for other links", async () => {
    const result = await addCompanyFromUrl(deps, "https://www.naukri.com/job-listings-123");
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.reason).toContain("Greenhouse, Lever, Ashby, SmartRecruiters and Workable");
  });

  it("asks for the board link when a URL only has a job ID", async () => {
    const result = await addCompanyFromUrl(deps, "https://acme.com/careers?gh_jid=4567890");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("greenhouse job");
  });

  it("refuses duplicates and boards that do not exist", async () => {
    await addCompanyFromUrl(deps, "https://jobs.lever.co/palantir");
    expect(await addCompanyFromUrl(deps, "https://jobs.lever.co/palantir")).toMatchObject({
      ok: false,
    });
    const missing = await addCompanyFromUrl(deps, "https://jobs.lever.co/nobody");
    expect(missing).toMatchObject({ ok: false });
    expect(await db.companies.get("lever:nobody")).toBeUndefined();
  });
});

describe("syncBoards", () => {
  it("closes jobs a board no longer lists, but nothing when the fetch fails", async () => {
    await addCompanyFromUrl(deps, "https://jobs.lever.co/palantir");
    routes.set(LEVER, leverFixture.slice(0, 2));
    expect(await syncBoards(deps)).toMatchObject({ companies: 1, failed: 0, closed: 1 });

    routes.delete(LEVER);
    expect(await syncBoards(deps)).toMatchObject({ failed: 1, closed: 0 });
    expect(await db.jobs.where("status").equals("new").count()).toBe(2);
    expect((await db.companies.get("lever:palantir"))?.lastStatus).toBe("not_found");
  });

  it("skips disabled companies", async () => {
    await addCompanyFromUrl(deps, "https://jobs.lever.co/palantir");
    await db.companies.update("lever:palantir", { enabled: false });
    expect(await syncBoards(deps)).toMatchObject({ companies: 0 });
  });

  it("does not re-fetch SmartRecruiters descriptions it already has", async () => {
    await addCompanyFromUrl(deps, "https://jobs.smartrecruiters.com/BoschGroup");
    const withDescription = await db.jobs.get("smartrecruiters:BoschGroup:744000159074300");
    expect(withDescription?.snippet).not.toBe("");
    log.length = 0;
    await syncBoards(deps);
    expect(log).not.toContain(SR_DETAIL);
    const after = await db.jobs.get("smartrecruiters:BoschGroup:744000159074300");
    expect(after?.descHash).toBe(withDescription?.descHash);
    expect(after?.skills).toEqual(withDescription?.skills);
  });
});
