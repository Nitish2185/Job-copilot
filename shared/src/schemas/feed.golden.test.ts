/**
 * Parses the Go crawler's golden output with the Zod feed schemas, so the Go
 * structs and the TypeScript contract can never drift apart (spec 7.10).
 */
import { describe, expect, it } from "vitest";
import closed from "../../../crawler/testdata/golden/feed/closed/2026-11-02.json";
import companies from "../../../crawler/testdata/golden/feed/companies.json";
import index from "../../../crawler/testdata/golden/feed/index.json";
import shard from "../../../crawler/testdata/golden/feed/jobs/2026-11-02.json";
import snapshot from "../../../crawler/testdata/golden/feed/snapshot.json";
import { FEED_SCHEMA_VERSION } from "../config";
import {
  FeedClosedShardSchema,
  FeedCompaniesSchema,
  FeedIndexSchema,
  FeedShardSchema,
  FeedSnapshotSchema,
} from "./feed";

describe("Go crawler golden output", () => {
  it("snapshot.json matches FeedSnapshotSchema", () => {
    const parsed = FeedSnapshotSchema.parse(snapshot);
    expect(parsed.schemaVersion).toBe(FEED_SCHEMA_VERSION);
    expect(parsed.jobs.length).toBeGreaterThan(0);
  });

  it("jobs/<date>.json matches FeedShardSchema", () => {
    expect(FeedShardSchema.parse(shard).jobs.length).toBeGreaterThan(0);
  });

  it("closed/<date>.json matches FeedClosedShardSchema", () => {
    expect(FeedClosedShardSchema.parse(closed).ids.length).toBeGreaterThan(0);
  });

  it("index.json matches FeedIndexSchema and counts agree", () => {
    const parsed = FeedIndexSchema.parse(index);
    expect(parsed.schemaVersion).toBe(FEED_SCHEMA_VERSION);
    expect(parsed.snapshot.count).toBe(snapshot.jobs.length);
    expect(parsed.shards[0]?.count).toBe(shard.jobs.length);
  });

  it("companies.json matches FeedCompaniesSchema", () => {
    const parsed = FeedCompaniesSchema.parse(companies);
    expect(parsed.companies.some((c) => c.lastStatus === "not_found")).toBe(true);
  });
});
