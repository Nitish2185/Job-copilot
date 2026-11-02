/**
 * Raw job -> feed-shaped job (port of crawler/internal/normalize). A parity test
 * checks the output against the Go crawler's golden feed.
 */
import { isAutoSubmitUrl } from "../hosts";
import { parseExperience } from "../parsing/experience";
import { htmlToText, plainText } from "../parsing/html";
import { detectRemote, parseCountries, parseCountriesFromLocations } from "../parsing/location";
import { collapseWhitespace, makeSnippet } from "../parsing/normalize";
import type { FeedJob } from "../schemas/feed";
import { tagSkills } from "../skills/tagger";
import type { BoardCompany, RawJob } from "./types";

/** A FeedJob before the first-seen time is known. */
export type NormalizedJob = Omit<FeedJob, "firstSeenAt">;

const ISO_COUNTRY = /^[A-Za-z]{2}$/;
const CURRENCY = /^[A-Z]{3}$/;

export function rawDescription(raw: RawJob): string {
  return raw.descriptionText.trim() !== ""
    ? plainText(raw.descriptionText)
    : htmlToText(raw.descriptionHtml);
}

/** Lowercase hex SHA-256 of the UTF-8 text (Web Crypto: works in browsers, workers and Node). */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** UTC timestamp with whole seconds, like the Go crawler ("2026-11-02T06:00:00Z"). */
export function isoSeconds(ms: number): string {
  return `${new Date(ms).toISOString().slice(0, 19)}Z`;
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return (u.protocol === "https:" || u.protocol === "http:") && u.host !== "";
  } catch {
    return false;
  }
}

function dedupe(values: readonly string[]): string[] {
  const out: string[] = [];
  for (const v of values) {
    const c = collapseWhitespace(v);
    if (c !== "" && !out.includes(c)) out.push(c);
  }
  return out;
}

function countries(locations: string[], hints: readonly string[]): string[] {
  const all = new Set(parseCountriesFromLocations(locations));
  for (const hint of hints) {
    const h = hint.trim();
    if (ISO_COUNTRY.test(h)) all.add(h.toUpperCase());
    else for (const c of parseCountries(h)) all.add(c);
  }
  return [...all].sort();
}

/**
 * Builds a feed-shaped job, or returns null when the job cannot be listed
 * (missing title or ID, or an apply URL off the auto-submit allowlist).
 */
export async function normalizeRawJob(
  company: BoardCompany,
  raw: RawJob,
): Promise<NormalizedJob | null> {
  const title = collapseWhitespace(raw.title);
  const externalId = raw.externalId.trim();
  if (!title || !externalId || /\s/.test(externalId) || company.token.includes(":")) return null;
  const applyUrl = raw.applyUrl.trim();
  if (!isAutoSubmitUrl(applyUrl)) return null;
  const pageUrl = isHttpUrl(raw.url.trim()) ? raw.url.trim() : applyUrl;

  const description = rawDescription(raw);
  const locations = dedupe(raw.locations);
  const both = `${title}\n${description}`;
  const experience = parseExperience(both);

  const job: NormalizedJob = {
    id: `${company.platform}:${company.token}:${externalId}`,
    platform: company.platform,
    company: { name: collapseWhitespace(company.name), token: company.token },
    title,
    locations,
    remote: detectRemote({
      workplaceType: raw.workplaceType ?? null,
      isRemote: raw.isRemote ?? null,
      locations,
      title,
    }),
    countryCodes: countries(locations, raw.countryHints),
    url: pageUrl,
    applyUrl,
    skills: tagSkills(both),
    snippet: makeSnippet(description, 300),
    descHash: await sha256Hex(description),
  };
  if (raw.postedAt !== undefined) job.postedAt = isoSeconds(raw.postedAt);
  if (experience.min !== undefined) job.expMin = experience.min;
  if (experience.max !== undefined) job.expMax = experience.max;
  const s = raw.salary;
  if (s && CURRENCY.test(s.currency) && (s.min !== undefined || s.max !== undefined)) {
    job.salary = { currency: s.currency, period: s.period };
    if (s.min !== undefined) job.salary.min = s.min;
    if (s.max !== undefined) job.salary.max = s.max;
  }
  const employmentType = collapseWhitespace(raw.employmentType);
  if (employmentType) job.employmentType = employmentType;
  const department = collapseWhitespace(raw.department);
  if (department) job.department = department;
  return job;
}
