/** Greenhouse board API (port of crawler/internal/fetch/greenhouse.go). */
import { z } from "zod";
import { decodeEntities } from "../parsing/html";
import {
  emptyRawJob,
  firstNonEmpty,
  parseTimestamp,
  trim,
  type BoardCompany,
  type RawJob,
} from "./types";

export const GREENHOUSE_API = "https://boards-api.greenhouse.io";

export function greenhouseJobsUrl(token: string, base = GREENHOUSE_API): string {
  return `${base}/v1/boards/${encodeURIComponent(token)}/jobs?content=true`;
}

/** Embedded application form; hosted job pages may redirect to the company's own site. */
export function greenhouseApplyUrl(token: string, jobId: string): string {
  return `https://job-boards.greenhouse.io/embed/job_app?for=${encodeURIComponent(token)}&token=${encodeURIComponent(jobId)}`;
}

const ResponseSchema = z.object({
  jobs: z.array(
    z.object({
      id: z.number(),
      title: z.string().nullish(),
      absolute_url: z.string().nullish(),
      updated_at: z.string().nullish(),
      first_published: z.string().nullish(),
      content: z.string().nullish(),
      location: z.object({ name: z.string().nullish() }).nullish(),
      departments: z.array(z.object({ name: z.string().nullish() })).nullish(),
    }),
  ),
});

export function parseGreenhouseJobs(json: unknown, company: BoardCompany): RawJob[] {
  return ResponseSchema.parse(json).jobs.map((j) => {
    const id = String(j.id);
    const raw = emptyRawJob(id, j.title ?? "");
    raw.url = firstNonEmpty(
      j.absolute_url,
      `https://job-boards.greenhouse.io/${encodeURIComponent(company.token)}/jobs/${id}`,
    );
    raw.applyUrl = greenhouseApplyUrl(company.token, id);
    raw.postedAt = parseTimestamp(j.first_published) ?? parseTimestamp(j.updated_at);
    raw.descriptionHtml = decodeEntities(j.content ?? "");
    const location = trim(j.location?.name);
    if (location) raw.locations = [location];
    raw.department = trim(j.departments?.[0]?.name);
    return raw;
  });
}
