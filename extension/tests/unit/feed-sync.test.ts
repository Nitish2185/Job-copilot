import { sha256Hex, type FeedIndex, type FeedJob } from "@job-copilot/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { JobCopilotDB } from "@/lib/db/db";
import { syncFeed, type FeedSyncDeps } from "@/lib/feed/sync";
import { sampleFeedJob } from "./helpers";

const BASE = "https://example.test/feed/";

/** An in-memory feed server with ETag support and a request log. */
class FakeFeed {
  files = new Map<string, string>();
  requests: string[] = [];
  etag = '"v1"';

  fetch: typeof fetch = (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    this.requests.push(url.replace(BASE, ""));
    const ifNoneMatch = new Headers(init?.headers).get("If-None-Match");
    if (url.endsWith("index.json") && ifNoneMatch === this.etag) {
      return Promise.resolve(new Response(null, { status: 304 }));
    }
    const body = this.files.get(url.replace(BASE, ""));
    if (body === undefined) return Promise.resolve(new Response("not found", { status: 404 }));
    const headers = url.endsWith("index.json") ? { etag: this.etag } : undefined;
    return Promise.resolve(new Response(body, { status: 200, headers }));
  };

  async publish(opts: {
    generatedAt: string;
    snapshot: FeedJob[];
    shards?: Record<string, FeedJob[]>;
    closed?: Record<string, string[]>;
    schemaVersion?: number;
  }): Promise<void> {
    const snapshotText = JSON.stringify({
      schemaVersion: 1,
      generatedAt: opts.generatedAt,
      jobs: opts.snapshot,
    });
    this.files.set("snapshot.json", snapshotText);
    const index: FeedIndex = {
      schemaVersion: opts.schemaVersion ?? 1,
      generatedAt: opts.generatedAt,
      totalOpenJobs: opts.snapshot.length,
      companyCount: 1,
      skillsVersion: "v",
      snapshot: {
        file: "snapshot.json",
        sha256: await sha256Hex(snapshotText),
        count: opts.snapshot.length,
      },
      shards: [],
      closedShards: [],
    };
    for (const [date, jobs] of Object.entries(opts.shards ?? {}).sort()) {
      const text = JSON.stringify({ date, jobs });
      this.files.set(`jobs/${date}.json`, text);
      index.shards.push({
        date,
        file: `jobs/${date}.json`,
        count: jobs.length,
        sha256: await sha256Hex(text),
      });
    }
    for (const [date, ids] of Object.entries(opts.closed ?? {}).sort()) {
      this.files.set(`closed/${date}.json`, JSON.stringify({ date, ids }));
      index.closedShards.push({ date, file: `closed/${date}.json`, count: ids.length });
    }
    this.files.set("index.json", JSON.stringify(index));
    this.etag = `"${opts.generatedAt}"`;
  }
}

const job = (n: number, extra: Partial<FeedJob> = {}) =>
  sampleFeedJob({ id: `lever:acme:${String(n)}`, title: `Engineer ${String(n)}`, ...extra });

let db: JobCopilotDB;
let feed: FakeFeed;
let deps: FeedSyncDeps;
let dbCount = 0;

beforeEach(() => {
  db = new JobCopilotDB(`feed-sync-${String(++dbCount)}`);
  feed = new FakeFeed();
  deps = { db, fetch: feed.fetch, baseUrl: BASE, now: () => new Date("2026-11-02T08:00:00Z") };
});

describe("syncFeed", () => {
  it("downloads the snapshot on the first sync", async () => {
    await feed.publish({
      generatedAt: "2026-11-02T06:00:00Z",
      snapshot: [job(1), job(2)],
      shards: { "2026-11-02": [job(2)] },
    });
    const result = await syncFeed(deps);
    expect(result).toMatchObject({ status: "snapshot", added: 2, closed: 0, totalOpenJobs: 2 });
    expect(await db.jobs.count()).toBe(2);
    const stored = await db.jobs.get("lever:acme:1");
    expect(stored).toMatchObject({ source: "feed", mode: "auto", status: "new" });
    expect(stored?.dedupeKey).toBe("acme|engineer 1|bengaluru india");
    const state = await db.feedState.get("feed");
    expect(state).toMatchObject({
      status: "ok",
      etag: '"2026-11-02T06:00:00Z"',
      appliedShards: { "2026-11-02": expect.any(String) as string },
    });
    expect(feed.requests).not.toContain("jobs/2026-11-02.json");
  });

  it("does nothing when the index has not changed (ETag)", async () => {
    await feed.publish({ generatedAt: "2026-11-02T06:00:00Z", snapshot: [job(1)] });
    await syncFeed(deps);
    feed.requests = [];
    expect(await syncFeed(deps)).toMatchObject({ status: "unchanged" });
    expect(feed.requests).toEqual(["index.json"]);
  });

  it("applies only new shards and closed files", async () => {
    await feed.publish({
      generatedAt: "2026-11-02T06:00:00Z",
      snapshot: [job(1), job(2)],
      shards: { "2026-11-02": [job(2)] },
    });
    await syncFeed(deps);
    await feed.publish({
      generatedAt: "2026-11-03T06:00:00Z",
      snapshot: [job(2), job(3)],
      shards: { "2026-11-02": [job(2)], "2026-11-03": [job(3)] },
      closed: { "2026-11-03": ["lever:acme:1"] },
    });
    feed.requests = [];
    const result = await syncFeed(deps);
    expect(result).toMatchObject({ status: "updated", added: 1, closed: 1 });
    expect(feed.requests).toEqual(["index.json", "jobs/2026-11-03.json", "closed/2026-11-03.json"]);
    expect(await db.jobs.get("lever:acme:1")).toMatchObject({
      status: "closed",
      closedAt: "2026-11-02T08:00:00.000Z",
    });
    expect(await db.jobs.get("lever:acme:3")).toMatchObject({ status: "new" });
  });

  it("re-applies a shard whose checksum changed (later run on the same day)", async () => {
    await feed.publish({
      generatedAt: "2026-11-02T06:00:00Z",
      snapshot: [job(1)],
      shards: { "2026-11-02": [job(1)] },
    });
    await syncFeed(deps);
    await feed.publish({
      generatedAt: "2026-11-02T12:00:00Z",
      snapshot: [job(1), job(2)],
      shards: { "2026-11-02": [job(1), job(2)] },
    });
    expect(await syncFeed(deps)).toMatchObject({ status: "updated", added: 1 });
  });

  it("keeps what the user did with a job", async () => {
    await feed.publish({ generatedAt: "2026-11-02T06:00:00Z", snapshot: [job(1), job(2)] });
    await syncFeed(deps);
    await db.jobs.update("lever:acme:1", { status: "saved" });
    await db.jobs.update("lever:acme:2", { status: "applied" });
    await feed.publish({
      generatedAt: "2026-11-03T06:00:00Z",
      snapshot: [job(1)],
      closed: { "2026-11-03": ["lever:acme:1", "lever:acme:2"] },
    });
    await syncFeed(deps);
    expect((await db.jobs.get("lever:acme:1"))?.status).toBe("saved");
    expect(await db.jobs.get("lever:acme:2")).toMatchObject({
      status: "applied",
      closedAt: expect.any(String) as string,
    });
  });

  it("refuses files that do not match their checksum and keeps the old data", async () => {
    await feed.publish({ generatedAt: "2026-11-02T06:00:00Z", snapshot: [job(1)] });
    feed.files.set(
      "snapshot.json",
      JSON.stringify({ schemaVersion: 1, generatedAt: "2026-11-02T06:00:00Z", jobs: [job(9)] }),
    );
    const result = await syncFeed(deps);
    expect(result.status).toBe("error");
    expect(result.error).toContain("checksum");
    expect(await db.jobs.count()).toBe(0);
    expect((await db.feedState.get("feed"))?.status).toBe("error");
  });

  it("stops and asks for an update when the feed format is newer", async () => {
    await feed.publish({
      generatedAt: "2026-11-02T06:00:00Z",
      snapshot: [job(1)],
      schemaVersion: 2,
    });
    expect(await syncFeed(deps)).toMatchObject({ status: "update_required" });
    expect(await db.jobs.count()).toBe(0);
    expect(await db.feedState.get("feed")).toMatchObject({
      status: "update_required",
      error: "Update the extension to keep receiving jobs",
    });
  });

  it("downloads the snapshot again after a gap longer than the kept shards", async () => {
    await feed.publish({
      generatedAt: "2026-09-01T06:00:00Z",
      snapshot: [job(1), job(2)],
      shards: { "2026-09-01": [job(1)] },
    });
    await syncFeed(deps);
    await feed.publish({
      generatedAt: "2026-11-02T06:00:00Z",
      snapshot: [job(2), job(3)],
      shards: { "2026-10-05": [job(3)] },
    });
    const result = await syncFeed(deps);
    expect(result).toMatchObject({ status: "snapshot", added: 1, closed: 1 });
    expect((await db.jobs.get("lever:acme:1"))?.status).toBe("closed");
  });

  it("reopens a closed job that comes back", async () => {
    await feed.publish({ generatedAt: "2026-11-02T06:00:00Z", snapshot: [job(1)] });
    await syncFeed(deps);
    await feed.publish({
      generatedAt: "2026-11-03T06:00:00Z",
      snapshot: [],
      closed: { "2026-11-03": ["lever:acme:1"] },
    });
    await syncFeed(deps);
    await feed.publish({
      generatedAt: "2026-11-04T06:00:00Z",
      snapshot: [job(1)],
      shards: { "2026-11-04": [job(1)] },
      closed: { "2026-11-03": ["lever:acme:1"] },
    });
    await syncFeed(deps);
    const stored = await db.jobs.get("lever:acme:1");
    expect(stored?.status).toBe("new");
    expect(stored?.closedAt).toBeUndefined();
  });

  it("starts over with a snapshot when the feed URL changes", async () => {
    await feed.publish({ generatedAt: "2026-11-02T06:00:00Z", snapshot: [job(1)] });
    await syncFeed(deps);
    const other = new FakeFeed();
    await other.publish({ generatedAt: "2026-11-02T06:00:00Z", snapshot: [job(5)] });
    const result = await syncFeed({
      ...deps,
      baseUrl: "https://mirror.test/feed/",
      fetch: (input, init) =>
        other.fetch(
          (input instanceof Request ? input.url : input.toString()).replace(
            "https://mirror.test/feed/",
            BASE,
          ),
          init,
        ),
    });
    expect(result.status).toBe("snapshot");
    expect((await db.jobs.get("lever:acme:1"))?.status).toBe("closed");
  });
});
