import { afterEach, describe, expect, it } from "vitest";
import { pageHandlers } from "@/lib/background/pageHandlers";
import { getDb } from "@/lib/db/db";
import { mergeListing, storeOrMerge } from "@/lib/jobs/merge";
import type { Handlers } from "@/lib/messaging/server";
import { sampleJob } from "./helpers";

afterEach(async () => {
  const db = getDb();
  await Promise.all([db.jobs.clear(), db.scores.clear()]);
});

const naukri = sampleJob({
  id: "manual:naukri",
  platform: "naukri",
  url: "https://www.naukri.com/job-listings-1",
  applyUrl: "https://www.naukri.com/job-listings-1",
  mode: "assist",
  firstSeenAt: "2026-11-02T00:00:00Z",
});

describe("mergeListing", () => {
  it("keeps the earliest date, every URL and the Auto apply link", () => {
    const lever = sampleJob({ firstSeenAt: "2026-10-30T00:00:00Z" });
    const merged = mergeListing(naukri, lever);
    expect(merged).toMatchObject({
      id: "manual:naukri",
      firstSeenAt: "2026-10-30T00:00:00Z",
      mode: "auto",
      applyUrl: "https://jobs.lever.co/acme/1/apply",
      alsoListedOn: [{ platform: "lever", url: "https://jobs.lever.co/acme/1" }],
    });
  });

  it("changes nothing for the same listing again", () => {
    expect(mergeListing(naukri, naukri)).toBeUndefined();
    const merged = mergeListing(naukri, sampleJob());
    if (!merged) throw new Error("expected a merge");
    expect(mergeListing(merged, { ...sampleJob(), id: "other-id" })).toBeUndefined();
  });

  it("never downgrades an Auto job to Assist", () => {
    const auto = sampleJob();
    const merged = mergeListing(auto, { ...naukri, firstSeenAt: "2026-12-01T00:00:00Z" });
    expect(merged?.mode).toBe("auto");
    expect(merged?.applyUrl).toBe(auto.applyUrl);
  });
});

describe("storeOrMerge", () => {
  it("saves new jobs and merges duplicates by dedupeKey", async () => {
    const db = getDb();
    expect((await storeOrMerge(db, naukri)).created).toBe(true);
    const second = await storeOrMerge(db, sampleJob());
    expect(second.created).toBe(false);
    expect(await db.jobs.count()).toBe(1);
    expect((await db.jobs.get("manual:naukri"))?.alsoListedOn).toHaveLength(1);
  });
});

describe("Add job manually", () => {
  const handlers = pageHandlers as Required<Handlers>;
  const sender = {} as never;

  it("saves a pasted job, with or without a link", async () => {
    const text = "We need a backend developer with 3-5 years of Go and PostgreSQL experience.";
    const r = await handlers["jobs/addManual"](
      { title: "Backend Developer", company: "Fictional Ltd", text },
      sender,
    );
    expect(r.created).toBe(true);
    const job = await getDb().jobs.get(r.jobId);
    expect(job).toMatchObject({
      source: "pasted",
      status: "saved",
      url: "",
      platform: "other",
      experienceMin: 3,
    });
    expect(job?.skills).toContain("postgresql");

    const again = await handlers["jobs/addManual"](
      { title: "Backend Developer", company: "Fictional Ltd", text },
      sender,
    );
    expect(again).toEqual({ jobId: r.jobId, created: false });

    const linked = await handlers["jobs/addManual"](
      {
        title: "Frontend Developer",
        company: "Fictional Ltd",
        url: "https://jobs.lever.co/fictional/9",
        text: "React and TypeScript for our design system team, remote friendly.",
      },
      sender,
    );
    expect((await getDb().jobs.get(linked.jobId))?.mode).toBe("auto");
  });
});
