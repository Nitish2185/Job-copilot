/** Lever postings API (port of crawler/internal/fetch/lever.go). */
import { z } from "zod";
import { htmlToText, plainText } from "../parsing/html";
import { collapseWhitespace } from "../parsing/normalize";
import { emptyRawJob, periodFromInterval, trim, type BoardCompany, type RawJob } from "./types";

export const LEVER_API = "https://api.lever.co";
export const LEVER_EU_API = "https://api.eu.lever.co";

export function leverPostingsUrl(company: BoardCompany, base?: string): string {
  const root = base ?? (company.variant === "eu" ? LEVER_EU_API : LEVER_API);
  return `${root}/v0/postings/${encodeURIComponent(company.token)}?mode=json`;
}

const PostingSchema = z.object({
  id: z.string(),
  text: z.string().nullish(),
  hostedUrl: z.string().nullish(),
  applyUrl: z.string().nullish(),
  createdAt: z.number().nullish(),
  descriptionPlain: z.string().nullish(),
  description: z.string().nullish(),
  additionalPlain: z.string().nullish(),
  workplaceType: z.string().nullish(),
  country: z.string().nullish(),
  lists: z.array(z.object({ text: z.string().nullish(), content: z.string().nullish() })).nullish(),
  categories: z
    .object({
      location: z.string().nullish(),
      team: z.string().nullish(),
      commitment: z.string().nullish(),
      allLocations: z.array(z.string()).nullish(),
    })
    .nullish(),
  salaryRange: z
    .object({
      min: z.number().nullish(),
      max: z.number().nullish(),
      currency: z.string().nullish(),
      interval: z.string().nullish(),
    })
    .nullish(),
});

type Posting = z.infer<typeof PostingSchema>;

/** Plain description, each list (heading + items), then the closing section. */
function leverText(p: Posting): string {
  const parts = [plainText(p.descriptionPlain ?? "")];
  if (parts[0] === "") parts[0] = htmlToText(p.description ?? "");
  for (const list of p.lists ?? []) {
    parts.push(collapseWhitespace(list.text ?? ""), htmlToText(list.content ?? ""));
  }
  parts.push(plainText(p.additionalPlain ?? ""));
  return parts.filter((part) => part !== "").join("\n");
}

export function parseLeverPostings(json: unknown): RawJob[] {
  return z
    .array(PostingSchema)
    .parse(json)
    .map((p) => {
      const raw = emptyRawJob(p.id, p.text ?? "");
      raw.url = p.hostedUrl ?? "";
      raw.applyUrl = p.applyUrl ?? "";
      raw.descriptionText = leverText(p);
      raw.employmentType = trim(p.categories?.commitment);
      raw.department = trim(p.categories?.team);
      if (p.createdAt && p.createdAt > 0) raw.postedAt = p.createdAt;
      const all = p.categories?.allLocations ?? [];
      if (all.length > 0) raw.locations = [...all];
      else if (p.categories?.location) raw.locations = [p.categories.location];
      if (p.workplaceType) raw.workplaceType = p.workplaceType;
      if (p.country) raw.countryHints = [p.country];
      const s = p.salaryRange;
      const period = periodFromInterval(s?.interval);
      if (s?.currency && period) {
        raw.salary = { currency: s.currency.toUpperCase(), period };
        if (s.min != null) raw.salary.min = s.min;
        if (s.max != null) raw.salary.max = s.max;
      }
      return raw;
    });
}
