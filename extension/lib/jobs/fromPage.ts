/**
 * Jobs saved from a page the user is viewing (spec 13.4) and quick scores for
 * search-result badges (13.7). Badges use only what the page already showed.
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
  type JobPlatform,
} from "@job-copilot/shared";
import type { PageJob } from "../apply/adapters/jobFromPage";
import { resolveMode } from "../apply/mode";
import { skillIdsFor } from "../ai/skillIds";
import { textToHtml } from "./description";

const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

/** Page address without tracking parameters, for the job ID. */
export function canonicalJobUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|ref|trk|src|from|source|fbclid|gclid)/i.test(key)) u.searchParams.delete(key);
    }
    u.hash = "";
    return u.href;
  } catch {
    return url;
  }
}

function isoDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const t = Date.parse(value);
  return Number.isNaN(t) ? undefined : iso(new Date(t));
}

export async function jobFromPage(page: PageJob, platform: JobPlatform, now: Date): Promise<Job> {
  const url = canonicalJobUrl(page.url);
  const text = htmlToText(page.descriptionHtml);
  const external = page.externalApplyUrl;
  // An "apply on company site" link to an Auto form makes the job an Auto job.
  const applyUrl =
    external && resolveMode(external).mode === "auto" ? external : (page.applyUrl ?? url);
  const experience = parseExperience(text);
  const skills = [
    ...new Set([...tagSkills(`${page.title}\n${text}`), ...skillIdsFor(page.skills ?? [])]),
  ].sort();
  const posted = isoDate(page.postedAt);
  return {
    id: `manual:${(await sha256Hex(url)).slice(0, 32)}`,
    platform,
    source: "saved_from_page",
    company: { name: page.company },
    title: page.title,
    locations: page.locations,
    remote: page.remote ? "remote" : detectRemote({ locations: page.locations, title: page.title }),
    countryCodes: parseCountriesFromLocations(page.locations),
    url,
    applyUrl,
    ...(external && { externalApplyUrl: external }),
    ...(posted && { postedAt: posted }),
    firstSeenAt: iso(now),
    skills,
    ...(experience.min !== undefined && { experienceMin: experience.min }),
    ...(experience.max !== undefined && { experienceMax: experience.max }),
    ...(page.salary && { salary: page.salary }),
    ...(page.employmentType && { employmentType: page.employmentType }),
    snippet: makeSnippet(text),
    ...(text && { description: { html: textToHtml(text), text, fetchedAt: iso(now) } }),
    mode: resolveMode(applyUrl).mode,
    dedupeKey: dedupeKey(page.company, page.title, page.locations[0] ?? ""),
    status: "saved",
  };
}

/** A throwaway job from a search card, scored from the title only. */
export function jobFromCard(
  card: { title: string; company: string; location: string; url: string },
  platform: JobPlatform,
  now: Date,
): Job {
  const locations = card.location ? [card.location] : [];
  return {
    id: `card:${card.url}`,
    platform,
    source: "saved_from_page",
    company: { name: card.company || "Unknown" },
    title: card.title,
    locations,
    remote: detectRemote({ locations, title: card.title }),
    countryCodes: parseCountriesFromLocations(locations),
    url: "",
    applyUrl: "",
    firstSeenAt: iso(now),
    skills: tagSkills(card.title),
    snippet: "",
    mode: "assist",
    dedupeKey: dedupeKey(card.company, card.title, card.location),
    status: "new",
  };
}
