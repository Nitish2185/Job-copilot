/// <reference types="node" />
/**
 * Validates a real crawl with the Zod feed schemas. Skipped unless FEED_DIR points
 * at a feed folder, e.g.:
 *
 *   go -C crawler run ./cmd/crawl crawl --data ../data
 *   FEED_DIR=../data/feed pnpm -C shared test
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FeedClosedShardSchema,
  FeedCompaniesSchema,
  FeedIndexSchema,
  FeedShardSchema,
  FeedSnapshotSchema,
} from "./feed";

const dir = process.env.FEED_DIR ? resolve(process.env.FEED_DIR) : undefined;

describe.skipIf(!dir)("local crawl output", () => {
  const read = (file: string) => readFileSync(join(dir ?? "", file));
  const json = (file: string): unknown => JSON.parse(read(file).toString("utf8"));
  const sha = (file: string) => createHash("sha256").update(read(file)).digest("hex");

  it("passes every feed schema and matches the index checksums", () => {
    const index = FeedIndexSchema.parse(json("index.json"));
    const snapshot = FeedSnapshotSchema.parse(json(index.snapshot.file));
    expect(snapshot.jobs.length).toBe(index.snapshot.count);
    expect(sha(index.snapshot.file)).toBe(index.snapshot.sha256);
    for (const shard of index.shards) {
      expect(FeedShardSchema.parse(json(shard.file)).jobs.length).toBe(shard.count);
      expect(sha(shard.file)).toBe(shard.sha256);
    }
    for (const closed of index.closedShards) {
      expect(FeedClosedShardSchema.parse(json(closed.file)).ids.length).toBe(closed.count);
    }
    FeedCompaniesSchema.parse(json("companies.json"));
  });
});
