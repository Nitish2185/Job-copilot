/**
 * Listing APIs with the user's own keys (spec 13.3): Adzuna and JSearch, off
 * by default, behind optional host permissions, within a daily call limit.
 * Only parameters confirmed in public docs are used (2026-11-03):
 * - Adzuna: GET https://api.adzuna.com/v1/api/jobs/{country}/search/{page}
 *   with app_id, app_key, what, where, results_per_page.
 * - JSearch (RapidAPI): GET https://jsearch.p.rapidapi.com/search with query,
 *   page, num_pages and the X-RapidAPI-Key / X-RapidAPI-Host headers.
 * Results become Jobs; the mode comes from the apply URL's host.
 */
import {
  dedupeKey,
  detectRemote,
  htmlToText,
  makeSnippet,
  parseCountriesFromLocations,
  parseExperience,
  sha256Hex,
  tagSkills,
  type Job,
  type Secrets,
  type Settings,
} from "@job-copilot/shared";
import { z } from "zod";
import { resolveMode } from "../apply/mode";
import type { JobCopilotDB } from "../db/db";
import { textToHtml } from "../jobs/description";

export const ADZUNA_ORIGIN = "https://api.adzuna.com/*";
export const JSEARCH_ORIGIN = "https://jsearch.p.rapidapi.com/*";
export const JSEARCH_HOST = "jsearch.p.rapidapi.com";
const PER_PAGE = 20;
/** At most this many searches (one per desired role) per source per run. */
const QUERIES_PER_RUN = 3;

const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

function isoOrNow(value: string | undefined, now: Date): string {
  const t = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(t) ? iso(now) : iso(new Date(t));
}

export function adzunaUrl(input: {
  country: string;
  appId: string;
  appKey: string;
  what: string;
  where?: string;
  page?: number;
}): string {
  const country = input.country.trim().toLowerCase() || "in";
  const url = new URL(
    `https://api.adzuna.com/v1/api/jobs/${encodeURIComponent(country)}/search/${String(input.page ?? 1)}`,
  );
  url.searchParams.set("app_id", input.appId);
  url.searchParams.set("app_key", input.appKey);
  url.searchParams.set("what", input.what);
  if (input.where) url.searchParams.set("where", input.where);
  url.searchParams.set("results_per_page", String(PER_PAGE));
  return url.href;
}

export function jsearchRequest(input: { query: string; key: string; page?: number }): {
  url: string;
  headers: Record<string, string>;
} {
  const url = new URL("https://jsearch.p.rapidapi.com/search");
  url.searchParams.set("query", input.query);
  url.searchParams.set("page", String(input.page ?? 1));
  url.searchParams.set("num_pages", "1");
  return {
    url: url.href,
    headers: { "X-RapidAPI-Key": input.key, "X-RapidAPI-Host": JSEARCH_HOST },
  };
}

const AdzunaSchema = z.object({
  results: z.array(
    z.object({
      id: z.union([z.string(), z.number()]),
      title: z.string(),
      company: z.object({ display_name: z.string().optional() }).optional(),
      location: z.object({ display_name: z.string().optional() }).optional(),
      redirect_url: z.url(),
      created: z.string().optional(),
      description: z.string().optional(),
    }),
  ),
});

const JsearchSchema = z.object({
  data: z.array(
    z.object({
      job_id: z.string().optional(),
      job_title: z.string(),
      employer_name: z.string().optional(),
      job_apply_link: z.url(),
      job_description: z.string().optional(),
      job_city: z.string().nullish(),
      job_country: z.string().nullish(),
      job_is_remote: z.boolean().nullish(),
      job_posted_at_datetime_utc: z.string().nullish(),
    }),
  ),
});

function makeJob(
  fields: {
    id: string;
    platform: "adzuna" | "jsearch";
    title: string;
    company: string;
    location: string;
    url: string;
    description: string;
    postedAt?: string;
    remote?: boolean;
  },
  now: Date,
): Job {
  const text = htmlToText(fields.description);
  const locations = fields.location ? [fields.location] : [];
  const experience = parseExperience(text);
  return {
    id: fields.id,
    platform: fields.platform,
    source: "aggregator",
    company: { name: fields.company || "Unknown company" },
    title: fields.title,
    locations,
    remote: fields.remote ? "remote" : detectRemote({ locations, title: fields.title }),
    countryCodes: parseCountriesFromLocations(locations),
    url: fields.url,
    applyUrl: fields.url,
    ...(fields.postedAt && { postedAt: isoOrNow(fields.postedAt, now) }),
    firstSeenAt: iso(now),
    skills: tagSkills(`${fields.title}\n${text}`),
    ...(experience.min !== undefined && { experienceMin: experience.min }),
    ...(experience.max !== undefined && { experienceMax: experience.max }),
    snippet: makeSnippet(text),
    ...(text && { description: { html: textToHtml(text), text, fetchedAt: iso(now) } }),
    mode: resolveMode(fields.url).mode,
    dedupeKey: dedupeKey(fields.company, fields.title, fields.location),
    status: "new",
  };
}

export function parseAdzuna(raw: unknown, now: Date): Job[] {
  const parsed = AdzunaSchema.safeParse(raw);
  if (!parsed.success) return [];
  return parsed.data.results.map((r) =>
    makeJob(
      {
        id: `adzuna:${String(r.id)}`,
        platform: "adzuna",
        title: r.title,
        company: r.company?.display_name ?? "",
        location: r.location?.display_name ?? "",
        url: r.redirect_url,
        description: r.description ?? "",
        ...(r.created && { postedAt: r.created }),
      },
      now,
    ),
  );
}

export async function parseJsearch(raw: unknown, now: Date): Promise<Job[]> {
  const parsed = JsearchSchema.safeParse(raw);
  if (!parsed.success) return [];
  return Promise.all(
    parsed.data.data.map(async (r) =>
      makeJob(
        {
          id: `jsearch:${r.job_id ?? (await sha256Hex(r.job_apply_link)).slice(0, 32)}`,
          platform: "jsearch",
          title: r.job_title,
          company: r.employer_name ?? "",
          location: [r.job_city, r.job_country].filter(Boolean).join(", "),
          url: r.job_apply_link,
          description: r.job_description ?? "",
          ...(r.job_posted_at_datetime_utc && { postedAt: r.job_posted_at_datetime_utc }),
          ...(r.job_is_remote && { remote: true }),
        },
        now,
      ),
    ),
  );
}

export interface CallLog {
  date: string;
  adzuna: number;
  jsearch: number;
}

export interface ListingDeps {
  db: JobCopilotDB;
  fetch: typeof fetch;
  now: () => Date;
  settings: Settings;
  secrets: Secrets;
  /** Whether the user granted the optional permission for this origin. */
  granted: (origin: string) => Promise<boolean>;
  loadCalls: () => Promise<CallLog | undefined>;
  saveCalls: (log: CallLog) => Promise<void>;
}

export interface ListingResult {
  calls: number;
  added: number;
  errors: string[];
}

/** One search per desired role (up to 3) on each enabled source, within its daily limit. */
export async function syncListings(
  deps: ListingDeps,
  search: { roles: string[]; city: string },
): Promise<ListingResult> {
  const now = deps.now();
  const today = now.toISOString().slice(0, 10);
  const stored = await deps.loadCalls();
  const calls: CallLog =
    stored?.date === today ? { ...stored } : { date: today, adzuna: 0, jsearch: 0 };
  const result: ListingResult = { calls: 0, added: 0, errors: [] };
  const queries = search.roles.filter((r) => r.trim()).slice(0, QUERIES_PER_RUN);
  if (queries.length === 0) return result;
  const found: Job[] = [];
  const { adzuna, jsearch } = deps.settings.sources;

  const keys = deps.secrets.adzuna;
  if (adzuna.enabled && keys && (await deps.granted(ADZUNA_ORIGIN))) {
    for (const what of queries) {
      if (calls.adzuna >= adzuna.maxCallsPerDay) break;
      calls.adzuna++;
      result.calls++;
      try {
        const res = await deps.fetch(
          adzunaUrl({
            country: adzuna.country,
            appId: keys.appId,
            appKey: keys.appKey,
            what,
            where: search.city,
          }),
          { headers: { Accept: "application/json" } },
        );
        if (!res.ok) throw new Error(`Adzuna answered ${String(res.status)}`);
        found.push(...parseAdzuna(await res.json(), now));
      } catch (e) {
        result.errors.push(e instanceof Error ? e.message : "Adzuna failed");
        break;
      }
    }
  }

  const key = deps.secrets.jsearchKey;
  if (jsearch.enabled && key && (await deps.granted(JSEARCH_ORIGIN))) {
    for (const role of queries) {
      if (calls.jsearch >= jsearch.maxCallsPerDay) break;
      calls.jsearch++;
      result.calls++;
      try {
        const query = search.city ? `${role} in ${search.city}` : role;
        const request = jsearchRequest({ query, key });
        const res = await deps.fetch(request.url, { headers: request.headers });
        if (!res.ok) throw new Error(`JSearch answered ${String(res.status)}`);
        found.push(...(await parseJsearch(await res.json(), now)));
      } catch (e) {
        result.errors.push(e instanceof Error ? e.message : "JSearch failed");
        break;
      }
    }
  }

  await deps.saveCalls(calls);
  const existing = new Set((await deps.db.jobs.toCollection().primaryKeys()).map(String));
  const keysSeen = new Set((await deps.db.jobs.orderBy("dedupeKey").uniqueKeys()).map(String));
  const fresh: Job[] = [];
  for (const job of found) {
    if (existing.has(job.id) || keysSeen.has(job.dedupeKey)) continue;
    existing.add(job.id);
    keysSeen.add(job.dedupeKey);
    fresh.push(job);
  }
  if (fresh.length) await deps.db.jobs.bulkPut(fresh);
  result.added = fresh.length;
  return result;
}
