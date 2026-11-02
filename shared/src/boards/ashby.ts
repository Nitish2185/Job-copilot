/** Ashby posting API (port of crawler/internal/fetch/ashby.go). */
import { z } from "zod";
import {
  emptyRawJob,
  parseTimestamp,
  periodFromInterval,
  trim,
  type BoardCompany,
  type RawJob,
} from "./types";

export const ASHBY_API = "https://api.ashbyhq.com";

export function ashbyBoardUrl(company: BoardCompany, base = ASHBY_API): string {
  return `${base}/posting-api/job-board/${encodeURIComponent(company.token)}?includeCompensation=true`;
}

const AddressSchema = z
  .object({ postalAddress: z.object({ addressCountry: z.string().nullish() }).nullish() })
  .nullish();

const ResponseSchema = z.object({
  jobs: z.array(
    z.object({
      id: z.string(),
      title: z.string().nullish(),
      department: z.string().nullish(),
      employmentType: z.string().nullish(),
      location: z.string().nullish(),
      address: AddressSchema,
      secondaryLocations: z
        .array(z.object({ location: z.string().nullish(), address: AddressSchema }))
        .nullish(),
      publishedAt: z.string().nullish(),
      isListed: z.boolean().nullish(),
      isRemote: z.boolean().nullish(),
      workplaceType: z.string().nullish(),
      jobUrl: z.string().nullish(),
      applyUrl: z.string().nullish(),
      descriptionHtml: z.string().nullish(),
      descriptionPlain: z.string().nullish(),
      compensation: z
        .object({
          summaryComponents: z
            .array(
              z.object({
                compensationType: z.string().nullish(),
                interval: z.string().nullish(),
                currencyCode: z.string().nullish(),
                minValue: z.number().nullish(),
                maxValue: z.number().nullish(),
              }),
            )
            .nullish(),
        })
        .nullish(),
    }),
  ),
});

const EMPLOYMENT_TYPES: Record<string, string> = {
  FullTime: "Full-time",
  PartTime: "Part-time",
  Intern: "Internship",
  Contract: "Contract",
  Temporary: "Temporary",
};

export function parseAshbyBoard(json: unknown): RawJob[] {
  return ResponseSchema.parse(json)
    .jobs.filter((j) => j.isListed !== false)
    .map((j) => {
      const raw = emptyRawJob(j.id, j.title ?? "");
      raw.url = j.jobUrl ?? "";
      raw.applyUrl = j.applyUrl ?? "";
      raw.postedAt = parseTimestamp(j.publishedAt);
      raw.descriptionText = j.descriptionPlain ?? "";
      raw.descriptionHtml = j.descriptionHtml ?? "";
      if (j.isRemote != null) raw.isRemote = j.isRemote;
      raw.department = trim(j.department);
      const employment = j.employmentType ?? "";
      raw.employmentType = EMPLOYMENT_TYPES[employment] ?? employment;
      if (j.workplaceType) raw.workplaceType = j.workplaceType;
      if (j.location) raw.locations.push(j.location);
      const country = j.address?.postalAddress?.addressCountry;
      if (country) raw.countryHints.push(country);
      for (const s of j.secondaryLocations ?? []) {
        if (s.location) raw.locations.push(s.location);
        const c = s.address?.postalAddress?.addressCountry;
        if (c) raw.countryHints.push(c);
      }
      for (const comp of j.compensation?.summaryComponents ?? []) {
        const period = periodFromInterval(comp.interval);
        if (comp.compensationType === "Salary" && comp.currencyCode && period) {
          raw.salary = { currency: comp.currencyCode.toUpperCase(), period };
          if (comp.minValue != null) raw.salary.min = comp.minValue;
          if (comp.maxValue != null) raw.salary.max = comp.maxValue;
          break;
        }
      }
      return raw;
    });
}
