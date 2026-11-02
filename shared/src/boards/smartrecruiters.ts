/** SmartRecruiters postings API (port of crawler/internal/fetch/smartrecruiters.go). */
import { z } from "zod";
import { htmlToText } from "../parsing/html";
import {
  emptyRawJob,
  firstNonEmpty,
  parseTimestamp,
  trim,
  type BoardCompany,
  type RawJob,
} from "./types";

export const SMARTRECRUITERS_API = "https://api.smartrecruiters.com";
export const SMARTRECRUITERS_PAGE_SIZE = 100;
export const SMARTRECRUITERS_MAX_PAGES = 50;

export function smartRecruitersListUrl(
  company: BoardCompany,
  page: number,
  base = SMARTRECRUITERS_API,
): string {
  return `${base}/v1/companies/${encodeURIComponent(company.token)}/postings?limit=${SMARTRECRUITERS_PAGE_SIZE}&offset=${page * SMARTRECRUITERS_PAGE_SIZE}`;
}

export function smartRecruitersDetailUrl(
  company: BoardCompany,
  id: string,
  base = SMARTRECRUITERS_API,
): string {
  return `${base}/v1/companies/${encodeURIComponent(company.token)}/postings/${encodeURIComponent(id)}`;
}

const Label = z.object({ label: z.string().nullish() }).nullish();

export const SmartRecruitersListSchema = z.object({
  totalFound: z.number(),
  content: z.array(
    z.object({
      id: z.string(),
      name: z.string().nullish(),
      releasedDate: z.string().nullish(),
      location: z
        .object({
          city: z.string().nullish(),
          country: z.string().nullish(),
          remote: z.boolean().nullish(),
          hybrid: z.boolean().nullish(),
          fullLocation: z.string().nullish(),
        })
        .nullish(),
      department: Label,
      function: Label,
      typeOfEmployment: Label,
    }),
  ),
});
export type SmartRecruitersList = z.infer<typeof SmartRecruitersListSchema>;

const DetailSchema = z.object({
  postingUrl: z.string().nullish(),
  applyUrl: z.string().nullish(),
  jobAd: z
    .object({
      sections: z.record(z.string(), z.object({ text: z.string().nullish() }).nullish()).nullish(),
    })
    .nullish(),
});

const SECTION_ORDER = [
  "companyDescription",
  "jobDescription",
  "qualifications",
  "additionalInformation",
];

function capitalizeWords(s: string): string {
  return s
    .split(/\s+/)
    .filter((w) => w !== "")
    .map((w) => (/^[a-z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** "pune, , India" -> "Pune, India". */
function srLocation(full: string, city: string): string {
  return (full || city)
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p !== "")
    .map(capitalizeWords)
    .join(", ");
}

/** Raw jobs from one list page, without descriptions (detailsMissing is true). */
export function parseSmartRecruitersList(
  list: SmartRecruitersList,
  company: BoardCompany,
): RawJob[] {
  return list.content.map((p) => {
    const raw = emptyRawJob(p.id, p.name ?? "");
    const publicUrl = `https://jobs.smartrecruiters.com/${encodeURIComponent(company.token)}/${encodeURIComponent(p.id)}`;
    raw.url = publicUrl;
    raw.applyUrl = publicUrl;
    raw.postedAt = parseTimestamp(p.releasedDate);
    raw.employmentType = p.typeOfEmployment?.label ?? "";
    raw.department = trim(p.department?.label) || trim(p.function?.label);
    const location = srLocation(p.location?.fullLocation ?? "", p.location?.city ?? "");
    if (location) raw.locations = [location];
    if (p.location?.country) raw.countryHints = [p.location.country.toUpperCase()];
    if (p.location?.remote) raw.workplaceType = "remote";
    else if (p.location?.hybrid) raw.workplaceType = "hybrid";
    raw.detailsMissing = true;
    return raw;
  });
}

/** Adds the description and URLs from a posting's detail response. */
export function applySmartRecruitersDetail(raw: RawJob, json: unknown): RawJob {
  const d = DetailSchema.parse(json);
  const sections = d.jobAd?.sections ?? {};
  const text = SECTION_ORDER.map((key) => htmlToText(sections[key]?.text ?? ""))
    .filter((t) => t !== "")
    .join("\n");
  return {
    ...raw,
    url: firstNonEmpty(d.postingUrl, raw.url),
    applyUrl: firstNonEmpty(d.applyUrl, raw.applyUrl),
    descriptionText: text,
    detailsMissing: false,
  };
}
