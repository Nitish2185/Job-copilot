import type { FeedPlatform } from "../schemas/feed";

/** A company board: one entry of crawler/companies.json or a personal board. */
export interface BoardCompany {
  name: string;
  platform: FeedPlatform;
  token: string;
  variant?: "eu";
}

export interface RawSalary {
  min?: number;
  max?: number;
  currency: string;
  period: "year" | "month" | "hour";
}

/**
 * A job as one platform describes it, before normalization. Mirrors
 * crawler/internal/fetch.RawJob.
 */
export interface RawJob {
  externalId: string;
  title: string;
  locations: string[];
  /** Country codes or names the API gives outside the location text. */
  countryHints: string[];
  workplaceType?: string;
  isRemote?: boolean;
  url: string;
  applyUrl: string;
  /** Epoch milliseconds, when known. */
  postedAt?: number;
  /** Plain text; when empty, descriptionHtml is converted. */
  descriptionText: string;
  descriptionHtml: string;
  /** True when the description was not fetched (SmartRecruiters detail calls are capped). */
  detailsMissing?: boolean;
  salary?: RawSalary;
  employmentType: string;
  department: string;
}

export function emptyRawJob(externalId: string, title: string): RawJob {
  return {
    externalId,
    title,
    locations: [],
    countryHints: [],
    url: "",
    applyUrl: "",
    descriptionText: "",
    descriptionHtml: "",
    employmentType: "",
    department: "",
  };
}

/** Parses RFC 3339 timestamps and YYYY-MM-DD dates; undefined when missing or invalid. */
export function parseTimestamp(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value.trim());
  return Number.isNaN(ms) ? undefined : ms;
}

/** Maps API pay intervals to year | month | hour. */
export function periodFromInterval(interval: string | null | undefined): RawSalary["period"] | "" {
  const i = (interval ?? "").toLowerCase();
  if (i.includes("year") || i.includes("annual")) return "year";
  if (i.includes("month")) return "month";
  if (i.includes("hour")) return "hour";
  return "";
}

export const trim = (value: string | null | undefined): string => (value ?? "").trim();

/** The first value that is not null, undefined or empty (Go's `if x == "" { x = y }`). */
export function firstNonEmpty(...values: (string | null | undefined)[]): string {
  for (const v of values) if (v !== undefined && v !== null && v !== "") return v;
  return "";
}
