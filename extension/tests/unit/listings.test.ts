import { defaultSettings, type Secrets } from "@job-copilot/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db/db";
import {
  ADZUNA_ORIGIN,
  JSEARCH_ORIGIN,
  adzunaUrl,
  jsearchRequest,
  parseAdzuna,
  parseJsearch,
  syncListings,
  type CallLog,
} from "@/lib/sources/listings";
import { sampleJob } from "./helpers";

const now = new Date("2026-11-03T12:00:00Z");

const ADZUNA = {
  results: [
    {
      id: 4711,
      title: "React Developer",
      company: { display_name: "Acme" },
      location: { display_name: "Pune, Maharashtra" },
      redirect_url: "https://www.adzuna.in/land/ad/4711",
      created: "2026-11-02T08:00:00Z",
      description: "3+ years of React and TypeScript.",
    },
  ],
};

const JSEARCH = {
  status: "OK",
  data: [
    {
      job_id: "abc==",
      job_title: "Backend Engineer",
      employer_name: "Globex",
      job_apply_link: "https://jobs.lever.co/globex/123",
      job_description: "Go and Kafka.",
      job_city: "Bengaluru",
      job_country: "IN",
      job_is_remote: false,
      job_posted_at_datetime_utc: "2026-11-01T00:00:00.000Z",
    },
  ],
};

afterEach(async () => {
  await getDb().jobs.clear();
});

describe("requests", () => {
  it("use only the documented parameters", () => {
    expect(
      adzunaUrl({
        country: "IN",
        appId: "id",
        appKey: "key",
        what: "react developer",
        where: "Pune",
      }),
    ).toBe(
      "https://api.adzuna.com/v1/api/jobs/in/search/1?app_id=id&app_key=key&what=react+developer&where=Pune&results_per_page=20",
    );
    expect(jsearchRequest({ query: "go developer in pune", key: "k" })).toEqual({
      url: "https://jsearch.p.rapidapi.com/search?query=go+developer+in+pune&page=1&num_pages=1",
      headers: { "X-RapidAPI-Key": "k", "X-RapidAPI-Host": "jsearch.p.rapidapi.com" },
    });
  });
});

describe("parsing", () => {
  it("turns Adzuna results into Assist jobs", () => {
    const [job] = parseAdzuna(ADZUNA, now);
    expect(job).toMatchObject({
      id: "adzuna:4711",
      platform: "adzuna",
      source: "aggregator",
      company: { name: "Acme" },
      countryCodes: ["IN"],
      mode: "assist",
      postedAt: "2026-11-02T08:00:00Z",
      experienceMin: 3,
      status: "new",
    });
    expect(job?.skills).toContain("react");
  });

  it("makes a JSearch job Auto when it applies on an allowlisted form", async () => {
    const [job] = await parseJsearch(JSEARCH, now);
    expect(job).toMatchObject({
      id: "jsearch:abc==",
      mode: "auto",
      applyUrl: "https://jobs.lever.co/globex/123",
      locations: ["Bengaluru, IN"],
    });
  });

  it("ignores answers it does not understand", async () => {
    expect(parseAdzuna({ error: "bad key" }, now)).toEqual([]);
    expect(await parseJsearch({ message: "Too many requests" }, now)).toEqual([]);
  });
});

function deps(overrides: {
  enabled?: boolean;
  granted?: boolean;
  calls?: CallLog;
  secrets?: Secrets;
  fetch?: typeof fetch;
}) {
  const settings = defaultSettings({ development: false });
  settings.sources.adzuna.enabled = overrides.enabled ?? true;
  settings.sources.adzuna.maxCallsPerDay = 2;
  settings.sources.jsearch.enabled = overrides.enabled ?? true;
  let saved: CallLog | undefined = overrides.calls;
  const fetchMock = vi.fn((url: string) =>
    Promise.resolve(
      new Response(JSON.stringify(url.includes("adzuna") ? ADZUNA : JSEARCH), { status: 200 }),
    ),
  );
  return {
    fetchMock,
    saved: () => saved,
    deps: {
      db: getDb(),
      fetch: (overrides.fetch ?? fetchMock) as unknown as typeof fetch,
      now: () => now,
      settings,
      secrets: overrides.secrets ?? {
        aiKeys: {},
        adzuna: { appId: "id", appKey: "key" },
        jsearchKey: "k",
      },
      granted: (origin: string) =>
        Promise.resolve(
          (overrides.granted ?? true) && [ADZUNA_ORIGIN, JSEARCH_ORIGIN].includes(origin),
        ),
      loadCalls: () => Promise.resolve(saved),
      saveCalls: (log: CallLog) => {
        saved = log;
        return Promise.resolve();
      },
    },
  };
}

describe("syncListings", () => {
  it("searches each role on both sources and adds new jobs once", async () => {
    const t = deps({});
    const result = await syncListings(t.deps, { roles: ["React Developer"], city: "Pune" });
    expect(result).toEqual({ calls: 2, added: 2, errors: [] });
    expect(t.saved()).toEqual({ date: "2026-11-03", adzuna: 1, jsearch: 1 });
    const again = await syncListings(t.deps, { roles: ["React Developer"], city: "Pune" });
    expect(again.added).toBe(0);
  });

  it("stays inside the daily limit", async () => {
    const t = deps({ calls: { date: "2026-11-03", adzuna: 2, jsearch: 20 } });
    const result = await syncListings(t.deps, { roles: ["A", "B"], city: "" });
    expect(result.calls).toBe(0);
    expect(t.fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing when off, without the permission, or without keys", async () => {
    for (const t of [
      deps({ enabled: false }),
      deps({ granted: false }),
      deps({ secrets: { aiKeys: {} } }),
    ]) {
      expect((await syncListings(t.deps, { roles: ["A"], city: "" })).calls).toBe(0);
      expect(t.fetchMock).not.toHaveBeenCalled();
    }
  });

  it("skips listings that duplicate a job already saved", async () => {
    await getDb().jobs.put(
      sampleJob({ id: "feed:1", dedupeKey: "acme|react developer|pune maharashtra" }),
    );
    const t = deps({});
    const result = await syncListings(t.deps, { roles: ["React Developer"], city: "Pune" });
    expect(result.added).toBe(1);
  });

  it("reports an error and stops that source", async () => {
    const t = deps({
      fetch: vi.fn(() => Promise.resolve(new Response("{}", { status: 401 }))),
    });
    const result = await syncListings(t.deps, { roles: ["A", "B"], city: "" });
    expect(result.errors).toEqual(["Adzuna answered 401", "JSearch answered 401"]);
    expect(result.calls).toBe(2);
  });
});
