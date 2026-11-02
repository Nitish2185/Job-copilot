/** Workable widget API (port of crawler/internal/fetch/workable.go). */
import { z } from "zod";
import { emptyRawJob, parseTimestamp, trim, type BoardCompany, type RawJob } from "./types";

export const WORKABLE_API = "https://apply.workable.com";

export function workableWidgetUrl(company: BoardCompany, base = WORKABLE_API): string {
  return `${base}/api/v1/widget/accounts/${encodeURIComponent(company.token)}?details=true`;
}

const ResponseSchema = z.object({
  jobs: z.array(
    z.object({
      title: z.string().nullish(),
      shortcode: z.string(),
      employment_type: z.string().nullish(),
      telecommuting: z.boolean().nullish(),
      department: z.string().nullish(),
      url: z.string().nullish(),
      application_url: z.string().nullish(),
      published_on: z.string().nullish(),
      created_at: z.string().nullish(),
      city: z.string().nullish(),
      state: z.string().nullish(),
      country: z.string().nullish(),
      description: z.string().nullish(),
      locations: z
        .array(
          z.object({
            country: z.string().nullish(),
            countryCode: z.string().nullish(),
            city: z.string().nullish(),
            region: z.string().nullish(),
            hidden: z.boolean().nullish(),
          }),
        )
        .nullish(),
    }),
  ),
});

const joinNonEmpty = (...values: (string | null | undefined)[]) =>
  values
    .map((v) => trim(v))
    .filter((v) => v !== "")
    .join(", ");

export function parseWorkableWidget(json: unknown): RawJob[] {
  return ResponseSchema.parse(json).jobs.map((j) => {
    const raw = emptyRawJob(j.shortcode, j.title ?? "");
    raw.url = j.url ?? "";
    raw.applyUrl = j.application_url ?? "";
    raw.postedAt = parseTimestamp(trim(j.published_on) || trim(j.created_at));
    raw.descriptionHtml = j.description ?? "";
    raw.employmentType = j.employment_type ?? "";
    raw.department = trim(j.department);
    if (j.telecommuting) raw.isRemote = true;
    for (const l of j.locations ?? []) {
      if (l.hidden) continue;
      const loc = joinNonEmpty(l.city, l.region, l.country);
      if (loc) raw.locations.push(loc);
      if (l.countryCode) raw.countryHints.push(l.countryCode);
    }
    if (raw.locations.length === 0) {
      const loc = joinNonEmpty(j.city, j.state, j.country);
      if (loc) raw.locations = [loc];
    }
    if (!raw.url && raw.externalId)
      raw.url = `https://apply.workable.com/j/${encodeURIComponent(raw.externalId)}`;
    if (!raw.applyUrl && raw.url) raw.applyUrl = `${raw.url.replace(/\/$/, "")}/apply`;
    return raw;
  });
}
