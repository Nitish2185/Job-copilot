/**
 * "Save this job" from a page the user is viewing (spec 13.4): schema.org
 * JobPosting data first (many job sites embed it), then the site's own DOM
 * (adapter selectors), then the AI fallback in the background.
 */

export interface PageJob {
  title: string;
  company: string;
  locations: string[];
  descriptionHtml: string;
  url: string;
  applyUrl?: string;
  /** "Apply on company site" link on a job board. */
  externalApplyUrl?: string;
  postedAt?: string;
  employmentType?: string;
  remote?: boolean;
  salary?: { min?: number; max?: number; currency: string; period: "year" | "month" | "hour" };
  skills?: string[];
}

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : v === undefined || v === null ? [] : [v];
}

/** Finds JobPosting objects anywhere in the JSON-LD (plain, arrays or @graph). */
function postings(node: unknown, out: Json[] = []): Json[] {
  for (const item of asArray(node)) {
    if (!isObject(item)) continue;
    const type = asArray(item["@type"]).map(str);
    if (type.includes("JobPosting")) out.push(item);
    if (item["@graph"]) postings(item["@graph"], out);
  }
  return out;
}

function placeText(place: unknown): string {
  if (!isObject(place)) return str(place);
  const address = isObject(place.address) ? place.address : place;
  return [address.addressLocality, address.addressRegion, address.addressCountry]
    .map((p) => (isObject(p) ? str(p.name) : str(p)))
    .filter((p) => p !== "")
    .join(", ");
}

const PERIODS: Record<string, "year" | "month" | "hour"> = {
  YEAR: "year",
  MONTH: "month",
  HOUR: "hour",
};

function salaryOf(value: unknown): PageJob["salary"] {
  if (!isObject(value)) return undefined;
  const currency = str(value.currency);
  const amount = isObject(value.value) ? value.value : value;
  const period = PERIODS[str(amount.unitText).toUpperCase()] ?? "year";
  const min = Number(amount.minValue ?? amount.value);
  const max = Number(amount.maxValue);
  if (!currency || (!Number.isFinite(min) && !Number.isFinite(max))) return undefined;
  return {
    currency: currency.toUpperCase(),
    period,
    ...(Number.isFinite(min) && { min }),
    ...(Number.isFinite(max) && { max }),
  };
}

/** The first schema.org JobPosting on the page, if any. */
export function readJsonLdJob(doc: Document): PageJob | undefined {
  for (const script of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
    let data: unknown;
    try {
      data = JSON.parse(script.textContent);
    } catch {
      continue;
    }
    const posting = postings(data)[0];
    if (!posting) continue;
    const title = str(posting.title);
    const org = posting.hiringOrganization;
    const company = isObject(org) ? str(org.name) : str(org);
    if (!title || !company) continue;
    const locations = asArray(posting.jobLocation)
      .map(placeText)
      .filter((l) => l !== "");
    const remote = str(posting.jobLocationType).toUpperCase() === "TELECOMMUTE";
    const salary = salaryOf(posting.baseSalary);
    const employment = asArray(posting.employmentType).map(str).filter(Boolean).join(", ");
    const url = str(posting.url) || doc.location.href;
    return {
      title,
      company,
      locations: remote && locations.length === 0 ? ["Remote"] : locations,
      descriptionHtml: str(posting.description),
      url,
      ...(str(posting.datePosted) && { postedAt: str(posting.datePosted) }),
      ...(employment && { employmentType: employment }),
      ...(remote && { remote }),
      ...(salary && { salary }),
      ...(str(posting.skills) && { skills: str(posting.skills).split(/,\s*/) }),
    };
  }
  return undefined;
}
