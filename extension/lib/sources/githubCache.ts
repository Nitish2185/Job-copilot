/**
 * Caches GitHub answers on this device for a week (spec 10, step 4), so going
 * back to the import step does not spend the 60-requests-an-hour limit again.
 * README details are keyed by the repo's last push, so new pushes refresh them.
 */
import { browser } from "wxt/browser";
import { z } from "zod";
import {
  listRepos,
  repoDetails,
  type GithubDeps,
  type GithubDetails,
  type GithubRepo,
} from "./github";

const KEY = "githubCache";
export const GITHUB_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const EntrySchema = z.object({ at: z.number(), value: z.unknown() });
const CacheSchema = z.object({
  repos: z.record(z.string(), EntrySchema).default({}),
  details: z.record(z.string(), EntrySchema).default({}),
});
type Cache = z.infer<typeof CacheSchema>;

async function read(): Promise<Cache> {
  const stored: unknown = (await browser.storage.local.get(KEY))[KEY];
  const parsed = CacheSchema.safeParse(stored ?? {});
  return parsed.success ? parsed.data : { repos: {}, details: {} };
}

function fresh(entry: { at: number } | undefined, now: number): boolean {
  return entry !== undefined && now - entry.at < GITHUB_CACHE_TTL_MS;
}

async function write(update: (cache: Cache) => void, now: number): Promise<void> {
  const cache = await read();
  update(cache);
  const keepFresh = (table: Cache["repos"]) =>
    Object.fromEntries(Object.entries(table).filter(([, entry]) => fresh(entry, now)));
  await browser.storage.local.set({
    [KEY]: { repos: keepFresh(cache.repos), details: keepFresh(cache.details) },
  });
}

/** The user's repos, from the cache when fetched in the last week (unless `refresh`). */
export async function listReposCached(
  deps: GithubDeps,
  username: string,
  options: { now?: Date; refresh?: boolean } = {},
): Promise<{ repos: GithubRepo[]; remaining?: number; cachedAt?: Date }> {
  const now = (options.now ?? new Date()).getTime();
  const key = username.toLowerCase();
  const hit = (await read()).repos[key];
  if (!options.refresh && hit && fresh(hit, now)) {
    return { repos: hit.value as GithubRepo[], cachedAt: new Date(hit.at) };
  }
  const result = await listRepos(deps, username);
  await write((cache) => {
    cache.repos[key] = { at: now, value: result.repos };
  }, now);
  return result;
}

/** Languages and README for one repo, cached until the repo is pushed again. */
export async function repoDetailsCached(
  deps: GithubDeps,
  repo: GithubRepo,
  now: Date = new Date(),
): Promise<GithubDetails> {
  const key = `${repo.fullName.toLowerCase()}@${repo.pushedAt}`;
  const hit = (await read()).details[key];
  if (hit && fresh(hit, now.getTime())) return hit.value as GithubDetails;
  const details = await repoDetails(deps, repo.fullName);
  await write((cache) => {
    cache.details[key] = { at: now.getTime(), value: details };
  }, now.getTime());
  return details;
}
