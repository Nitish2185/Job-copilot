/**
 * Shared feed sync (spec 13.1). First run: index + snapshot. Later runs: the index
 * with If-None-Match, then only new daily shards and closed files. Every file
 * listed with a checksum is verified before anything is written.
 */
import {
  FEED_SCHEMA_VERSION,
  FeedClosedShardSchema,
  FeedIndexSchema,
  FeedShardSchema,
  FeedSnapshotSchema,
  sha256Hex,
  type FeedIndex,
} from "@job-copilot/shared";
import type { FeedState, JobCopilotDB } from "../db/db";
import type { FeedSyncResult } from "../messaging/protocol";
import { closeJobs, feedJobToJob, upsertJobs } from "./jobs";

export interface FeedSyncDeps {
  db: JobCopilotDB;
  fetch: typeof fetch;
  baseUrl: string;
  now: () => Date;
}

const RETENTION_DAYS = 30;

class FeedError extends Error {}

function freshState(baseUrl: string): FeedState {
  return { id: "feed", baseUrl, appliedShards: {}, appliedClosed: {}, status: "never" };
}

function withSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

async function download(deps: FeedSyncDeps, file: string, sha256?: string): Promise<unknown> {
  const url = new URL(file, withSlash(deps.baseUrl)).toString();
  const res = await deps.fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new FeedError(`Could not download ${file} (HTTP ${String(res.status)})`);
  const text = await res.text();
  if (sha256 !== undefined && (await sha256Hex(text)) !== sha256) {
    throw new FeedError(`${file} does not match its checksum`);
  }
  return JSON.parse(text) as unknown;
}

/** True when a snapshot is needed: first sync, new feed URL, or offline longer than the shards cover. */
function needsSnapshot(state: FeedState, index: FeedIndex, baseUrl: string, now: Date): boolean {
  if (state.status === "never" || !state.lastIndexGeneratedAt || state.baseUrl !== baseUrl)
    return true;
  const lastDate = state.lastIndexGeneratedAt.slice(0, 10);
  const oldest = index.shards[0]?.date;
  if (oldest !== undefined) return lastDate < oldest;
  const ageDays = (now.getTime() - Date.parse(state.lastIndexGeneratedAt)) / 86_400_000;
  return ageDays > RETENTION_DAYS;
}

export async function syncFeed(
  deps: FeedSyncDeps,
  options: { force?: boolean } = {},
): Promise<FeedSyncResult> {
  const { db } = deps;
  const nowIso = deps.now().toISOString();
  const stored = await db.feedState.get("feed");
  const state = stored?.baseUrl === deps.baseUrl ? stored : freshState(deps.baseUrl);
  const save = (patch: Partial<FeedState>) =>
    db.feedState.put({ ...state, ...patch, lastCheckedAt: nowIso });

  try {
    const headers: Record<string, string> = {};
    if (state.etag && !options.force && state.status === "ok")
      headers["If-None-Match"] = state.etag;
    const res = await deps.fetch(new URL("index.json", withSlash(deps.baseUrl)).toString(), {
      headers,
      cache: "no-cache",
    });
    if (res.status === 304) {
      await save({});
      return { status: "unchanged", added: 0, closed: 0, totalOpenJobs: state.totalOpenJobs };
    }
    if (!res.ok) throw new FeedError(`Could not download index.json (HTTP ${String(res.status)})`);
    const index = FeedIndexSchema.parse(await res.json());

    if (index.schemaVersion !== FEED_SCHEMA_VERSION) {
      const newer = index.schemaVersion > FEED_SCHEMA_VERSION;
      await save({
        status: newer ? "update_required" : "error",
        error: newer
          ? "Update the extension to keep receiving jobs"
          : "The feed is older than this extension",
        schemaVersion: index.schemaVersion,
      });
      return { status: newer ? "update_required" : "error", added: 0, closed: 0 };
    }

    const etag = res.headers.get("etag") ?? undefined;
    let added = 0;
    let closed = 0;
    let status: FeedSyncResult["status"] = "updated";
    let appliedShards = { ...state.appliedShards };
    let appliedClosed = { ...state.appliedClosed };

    if (options.force || needsSnapshot(state, index, deps.baseUrl, deps.now())) {
      status = "snapshot";
      const snapshot = FeedSnapshotSchema.parse(
        await download(deps, index.snapshot.file, index.snapshot.sha256),
      );
      const jobs = snapshot.jobs.map(feedJobToJob);
      added = await upsertJobs(db, jobs);
      const open = new Set(jobs.map((j) => j.id));
      const feedIds = (await db.jobs.where("source").equals("feed").primaryKeys()).filter(
        (id) => !open.has(id),
      );
      closed = await closeJobs(db, feedIds, nowIso);
      // The snapshot already contains every listed shard and closed file.
      appliedShards = Object.fromEntries(index.shards.map((s) => [s.date, s.sha256]));
      appliedClosed = Object.fromEntries(index.closedShards.map((c) => [c.date, c.count]));
    } else {
      for (const ref of index.shards) {
        if (appliedShards[ref.date] === ref.sha256) continue;
        const shard = FeedShardSchema.parse(await download(deps, ref.file, ref.sha256));
        added += await upsertJobs(db, shard.jobs.map(feedJobToJob));
        appliedShards[ref.date] = ref.sha256;
      }
      for (const ref of index.closedShards) {
        if (appliedClosed[ref.date] === ref.count) continue;
        const closedShard = FeedClosedShardSchema.parse(await download(deps, ref.file));
        closed += await closeJobs(db, closedShard.ids, nowIso);
        appliedClosed[ref.date] = ref.count;
      }
    }

    // Forget dates the feed no longer lists.
    const listed = new Set(index.shards.map((s) => s.date));
    appliedShards = Object.fromEntries(
      Object.entries(appliedShards).filter(([d]) => listed.has(d)),
    );
    const listedClosed = new Set(index.closedShards.map((c) => c.date));
    appliedClosed = Object.fromEntries(
      Object.entries(appliedClosed).filter(([d]) => listedClosed.has(d)),
    );

    const next: Partial<FeedState> = {
      status: "ok",
      lastIndexGeneratedAt: index.generatedAt,
      lastSyncAt: nowIso,
      totalOpenJobs: index.totalOpenJobs,
      schemaVersion: index.schemaVersion,
      appliedShards,
      appliedClosed,
    };
    if (etag) next.etag = etag;
    if (status === "snapshot") next.snapshotGeneratedAt = index.generatedAt;
    await db.feedState.put({
      ...state,
      ...next,
      error: undefined,
      lastCheckedAt: nowIso,
    });
    return { status, added, closed, totalOpenJobs: index.totalOpenJobs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await save({ status: "error", error: message });
    return { status: "error", added: 0, closed: 0, error: message };
  }
}
