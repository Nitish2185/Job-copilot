/**
 * Full job descriptions, fetched on demand (spec 7.8): the feed carries only a
 * snippet. Greenhouse, Lever and SmartRecruiters have single-job endpoints;
 * Ashby and Workable return the whole board, which is cached for an hour.
 * HTML is always sanitized before it is stored (spec 4).
 */
import {
  ASHBY_API,
  GREENHOUSE_API,
  LEVER_API,
  LEVER_EU_API,
  applySmartRecruitersDetail,
  ashbyBoardUrl,
  emptyRawJob,
  parseAshbyBoard,
  parseGreenhouseJobs,
  parseLeverPostings,
  parseWorkableWidget,
  rawDescription,
  smartRecruitersDetailUrl,
  workableWidgetUrl,
  type BoardCompany,
  type FeedPlatform,
  type Job,
  type RawJob,
} from "@job-copilot/shared";
import type { JobCopilotDB } from "../db/db";

export const BOARD_CACHE_MS = 60 * 60 * 1000;
/** Descriptions older than this are fetched again when the job is opened. */
export const DESCRIPTION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const BOARD_PLATFORMS = new Set<string>([
  "greenhouse",
  "lever",
  "ashby",
  "smartrecruiters",
  "workable",
]);

export interface DescriptionDeps {
  fetch: typeof fetch;
  /** DOMPurify in the dashboard; tests pass their own. */
  sanitize: (html: string) => string;
  now: () => Date;
}

export class DescriptionError extends Error {
  override name = "DescriptionError";
}

/** Board and job ID from a job ID like "lever:acme:abc-123"; undefined for other sources. */
export function descriptionSource(
  job: Pick<Job, "id" | "url" | "company">,
): { board: BoardCompany; externalId: string } | undefined {
  const [platform, token, ...rest] = job.id.split(":");
  const externalId = rest.join(":");
  if (!platform || !token || !externalId || !BOARD_PLATFORMS.has(platform)) return undefined;
  const board: BoardCompany = {
    name: job.company.name,
    platform: platform as FeedPlatform,
    token,
  };
  if (platform === "lever" && /\.eu\.lever\.co$/i.test(hostOf(job.url))) board.variant = "eu";
  return { board, externalId };
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

async function getJson(deps: DescriptionDeps, url: string): Promise<unknown> {
  const res = await deps.fetch(url, { headers: { Accept: "application/json" } });
  if (res.status === 404)
    throw new DescriptionError("This job is no longer on the company's board.");
  if (!res.ok) throw new DescriptionError(`The job board answered HTTP ${String(res.status)}.`);
  return res.json();
}

// Whole-board answers (Ashby, Workable), kept for an hour per dashboard session.
const boardCache = new Map<string, { at: number; jobs: RawJob[] }>();

async function cachedBoard(
  deps: DescriptionDeps,
  url: string,
  parse: (json: unknown) => RawJob[],
): Promise<RawJob[]> {
  const now = deps.now().getTime();
  const hit = boardCache.get(url);
  if (hit && now - hit.at < BOARD_CACHE_MS) return hit.jobs;
  const jobs = parse(await getJson(deps, url));
  boardCache.set(url, { at: now, jobs });
  return jobs;
}

export function clearBoardCache(): void {
  boardCache.clear();
}

async function fetchRaw(
  deps: DescriptionDeps,
  board: BoardCompany,
  externalId: string,
  job: Pick<Job, "title" | "url" | "applyUrl">,
): Promise<RawJob | undefined> {
  const id = encodeURIComponent(externalId);
  const token = encodeURIComponent(board.token);
  switch (board.platform) {
    case "greenhouse": {
      const json = await getJson(deps, `${GREENHOUSE_API}/v1/boards/${token}/jobs/${id}`);
      return parseGreenhouseJobs({ jobs: [json] }, board)[0];
    }
    case "lever": {
      const root = board.variant === "eu" ? LEVER_EU_API : LEVER_API;
      return parseLeverPostings([await getJson(deps, `${root}/v0/postings/${token}/${id}`)])[0];
    }
    case "smartrecruiters": {
      const base: RawJob = {
        ...emptyRawJob(externalId, job.title),
        url: job.url,
        applyUrl: job.applyUrl,
      };
      return applySmartRecruitersDetail(
        base,
        await getJson(deps, smartRecruitersDetailUrl(board, externalId)),
      );
    }
    case "ashby":
      return (await cachedBoard(deps, ashbyBoardUrl(board, ASHBY_API), parseAshbyBoard)).find(
        (j) => j.externalId === externalId,
      );
    case "workable":
      return (await cachedBoard(deps, workableWidgetUrl(board), parseWorkableWidget)).find(
        (j) => j.externalId === externalId,
      );
  }
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${String(c.charCodeAt(0))};`);
}

/** Plain text as paragraphs, for boards that only give text. */
export function textToHtml(text: string): string {
  return text
    .split(/\n{2,}|\n/)
    .map((p) => p.trim())
    .filter((p) => p !== "")
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join("");
}

/** Fetches, sanitizes and stores the full description; returns the stored value. */
export async function ensureDescription(
  db: JobCopilotDB,
  deps: DescriptionDeps,
  job: Job,
  options: { refresh?: boolean } = {},
): Promise<NonNullable<Job["description"]>> {
  const now = deps.now();
  const current = job.description;
  if (
    current &&
    !options.refresh &&
    now.getTime() - Date.parse(current.fetchedAt) < DESCRIPTION_MAX_AGE_MS
  ) {
    return current;
  }
  const source = descriptionSource(job);
  if (!source) throw new DescriptionError("Only the snippet is available for this job.");
  const raw = await fetchRaw(deps, source.board, source.externalId, job);
  if (!raw) throw new DescriptionError("This job is no longer on the company's board.");
  const text = rawDescription(raw);
  const html = deps.sanitize(
    raw.descriptionHtml.trim() !== "" ? raw.descriptionHtml : textToHtml(text),
  );
  const description = {
    html,
    text,
    fetchedAt: now.toISOString().replace(/\.\d{3}Z$/, "Z"),
  };
  await db.jobs.update(job.id, { description });
  return description;
}
