/** AI response cache (spec 11.4) in the aiCache table. */
import { sha256Hex } from "@job-copilot/shared";
import type { JobCopilotDB } from "../db/db";

/** JSON with object keys sorted, so equal inputs give equal cache keys. */
export function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export function cacheKey(
  taskId: string,
  promptVersion: number,
  model: string,
  input: unknown,
): Promise<string> {
  return sha256Hex(`${taskId}\n${String(promptVersion)}\n${model}\n${canonicalJson(input)}`);
}

export async function getCached(db: JobCopilotDB, key: string, now: Date): Promise<unknown> {
  const entry = await db.aiCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt && entry.expiresAt <= now.toISOString()) return undefined;
  return entry.value;
}

export async function putCached(
  db: JobCopilotDB,
  entry: { key: string; task: string; promptVersion: number; model: string; value: unknown },
  now: Date,
  ttlMs: number | null,
): Promise<void> {
  const record = { ...entry, createdAt: now.toISOString().replace(/\.\d{3}Z$/, "Z") };
  await db.aiCache.put(
    ttlMs === null
      ? record
      : {
          ...record,
          expiresAt: new Date(now.getTime() + ttlMs).toISOString().replace(/\.\d{3}Z$/, "Z"),
        },
  );
}

/** Deletes expired entries (run by the daily cleanup). */
export async function pruneExpired(db: JobCopilotDB, now: Date): Promise<number> {
  return db.aiCache.where("expiresAt").below(now.toISOString()).delete();
}

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Cache lifetimes per task (spec 11.4); null never expires. */
export const CACHE_TTL = {
  extractProfile: null,
  describeProject: null,
  analyzeJd: 30 * DAY_MS,
  scoreJobs: 30 * DAY_MS,
  pickProjects: 30 * DAY_MS,
  tailorResume: 30 * DAY_MS,
  writeCoverLetter: 30 * DAY_MS,
  answerQuestion: 90 * DAY_MS,
} as const;
