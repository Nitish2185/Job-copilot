/**
 * Personal company boards (spec 13.2): the user adds a careers or job URL; the
 * background fetches that board's public API directly and normalizes its jobs
 * with the same rules as the crawler.
 */
import {
  ashbyBoardUrl,
  applySmartRecruitersDetail,
  detectFromUrl,
  greenhouseJobsUrl,
  leverPostingsUrl,
  normalizeRawJob,
  parseAshbyBoard,
  parseGreenhouseJobs,
  parseLeverPostings,
  parseSmartRecruitersList,
  parseWorkableWidget,
  sha256Hex,
  smartRecruitersDetailUrl,
  smartRecruitersListUrl,
  SMARTRECRUITERS_MAX_PAGES,
  SMARTRECRUITERS_PAGE_SIZE,
  SmartRecruitersListSchema,
  workableWidgetUrl,
  type BoardCompany,
  type Company,
  type Job,
  type RawJob,
} from "@job-copilot/shared";
import type { JobCopilotDB } from "../db/db";
import { closeJobs, feedJobToJob, upsertJobs } from "../feed/jobs";
import type { BoardsSyncResult } from "../messaging/protocol";

export const SUPPORTED_PLATFORMS_TEXT = "Greenhouse, Lever, Ashby, SmartRecruiters and Workable";

/** SmartRecruiters description requests per company per sync. */
const SMARTRECRUITERS_DETAIL_CAP = 50;
const REQUEST_TIMEOUT_MS = 20_000;

export class BoardNotFoundError extends Error {
  override name = "BoardNotFoundError";
}

export interface BoardDeps {
  db: JobCopilotDB;
  fetch: typeof fetch;
  now: () => Date;
}

async function getJson(deps: BoardDeps, url: string): Promise<unknown> {
  const res = await deps.fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (res.status === 404) throw new BoardNotFoundError(`Not found: ${url}`);
  if (!res.ok) throw new Error(`HTTP ${String(res.status)} from ${url}`);
  return res.json() as Promise<unknown>;
}

function toBoard(company: Company): BoardCompany {
  const board: BoardCompany = {
    name: company.name,
    platform: company.platform,
    token: company.token,
  };
  if (company.variant) board.variant = company.variant;
  return board;
}

/** Fetches one board and returns raw jobs. `hasDetails` skips known SmartRecruiters descriptions. */
export async function fetchBoard(
  deps: BoardDeps,
  board: BoardCompany,
  hasDetails: (externalId: string) => boolean = () => false,
): Promise<RawJob[]> {
  switch (board.platform) {
    case "greenhouse":
      return parseGreenhouseJobs(await getJson(deps, greenhouseJobsUrl(board.token)), board);
    case "lever":
      return parseLeverPostings(await getJson(deps, leverPostingsUrl(board)));
    case "ashby":
      return parseAshbyBoard(await getJson(deps, ashbyBoardUrl(board)));
    case "workable":
      return parseWorkableWidget(await getJson(deps, workableWidgetUrl(board)));
    case "smartrecruiters": {
      const jobs: RawJob[] = [];
      let details = 0;
      for (let page = 0; page < SMARTRECRUITERS_MAX_PAGES; page++) {
        const list = SmartRecruitersListSchema.parse(
          await getJson(deps, smartRecruitersListUrl(board, page)),
        );
        for (const raw of parseSmartRecruitersList(list, board)) {
          if (!hasDetails(raw.externalId) && details < SMARTRECRUITERS_DETAIL_CAP) {
            details++;
            try {
              const detail = await getJson(deps, smartRecruitersDetailUrl(board, raw.externalId));
              jobs.push(applySmartRecruitersDetail(raw, detail));
              continue;
            } catch {
              // keep the job without a description; a later sync tries again
            }
          }
          jobs.push(raw);
        }
        const fetched = (page + 1) * SMARTRECRUITERS_PAGE_SIZE;
        if (list.content.length < SMARTRECRUITERS_PAGE_SIZE || fetched >= list.totalFound) break;
      }
      return jobs;
    }
  }
}

/** Fetches, normalizes and stores one company's jobs; closes jobs it no longer lists. */
export async function syncCompany(
  deps: BoardDeps,
  company: Company,
): Promise<{ added: number; closed: number; jobs: number }> {
  const { db } = deps;
  const nowIso = deps.now().toISOString();
  const prefix = `${company.platform}:${company.token}:`;
  const previous = await db.jobs.where("company.token").equals(company.token).toArray();
  const previousById = new Map(
    previous.filter((j) => j.id.startsWith(prefix)).map((j) => [j.id, j]),
  );
  const emptyHash = await sha256Hex("");

  let raws: RawJob[];
  try {
    raws = await fetchBoard(deps, toBoard(company), (externalId) => {
      const known = previousById.get(prefix + externalId);
      const hash = known?.descHash;
      return hash !== undefined && hash !== emptyHash;
    });
  } catch (error) {
    await db.companies.update(company.id, {
      lastFetchedAt: nowIso,
      lastStatus: error instanceof BoardNotFoundError ? "not_found" : "error",
    });
    throw error;
  }

  const jobs: Job[] = [];
  for (const raw of raws) {
    const normalized = await normalizeRawJob(toBoard(company), raw);
    if (!normalized) continue;
    const known = previousById.get(normalized.id);
    const job = feedJobToJob({ ...normalized, firstSeenAt: known?.firstSeenAt ?? nowIso });
    job.source = "personal_board";
    if (raw.detailsMissing && known?.descHash && known.descHash !== emptyHash) {
      // Keep what the last full fetch learned from the description.
      job.skills = known.skills;
      job.snippet = known.snippet;
      job.descHash = known.descHash;
      if (known.experienceMin !== undefined) job.experienceMin = known.experienceMin;
      if (known.experienceMax !== undefined) job.experienceMax = known.experienceMax;
    }
    jobs.push(job);
  }

  const added = await upsertJobs(db, jobs);
  const current = new Set(jobs.map((j) => j.id));
  const gone = [...previousById.values()]
    .filter((j) => j.source === "personal_board" && !j.closedAt && !current.has(j.id))
    .map((j) => j.id);
  const closed = await closeJobs(db, gone, nowIso);
  await db.companies.update(company.id, {
    lastFetchedAt: nowIso,
    lastStatus: jobs.length > 0 ? "ok" : "empty",
  });
  return { added, closed, jobs: jobs.length };
}

function nameFromToken(token: string): string {
  return token
    .split(/[-_.]+/)
    .filter((w) => w !== "")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export type AddCompanyResult =
  { ok: true; company: Company; jobs: number } | { ok: false; reason: string };

/** Detects the board from a URL, checks it lists jobs, and saves it. */
export async function addCompanyFromUrl(
  deps: BoardDeps,
  url: string,
  name?: string,
): Promise<AddCompanyResult> {
  const match = detectFromUrl(url);
  if (!match) {
    return {
      ok: false,
      reason: `That link is not a job board we can read. Supported: ${SUPPORTED_PLATFORMS_TEXT}. Paste the company's job board link, for example https://jobs.lever.co/company.`,
    };
  }
  if (match.token === null) {
    return {
      ok: false,
      reason: `This looks like a ${match.platform} job, but the link does not name the company's board. Open the job's "Apply" page and paste that link instead.`,
    };
  }
  const id = `${match.platform}:${match.token}`;
  if (await deps.db.companies.get(id)) {
    return { ok: false, reason: "This company is already in your list." };
  }
  const company: Company = {
    id,
    name: name !== undefined && name.trim() !== "" ? name.trim() : nameFromToken(match.token),
    platform: match.platform,
    token: match.token,
    addedAt: deps.now().toISOString(),
    enabled: true,
  };
  if (match.variant) company.variant = match.variant;
  await deps.db.companies.put(company);
  try {
    const result = await syncCompany(deps, company);
    return { ok: true, company: (await deps.db.companies.get(id)) ?? company, jobs: result.jobs };
  } catch (error) {
    await deps.db.companies.delete(id);
    return {
      ok: false,
      reason:
        error instanceof BoardNotFoundError
          ? `No ${match.platform} board named "${match.token}" was found.`
          : `Could not read the board right now. Try again later.`,
    };
  }
}

/** Syncs every enabled company (or one), one at a time to stay polite. */
export async function syncBoards(deps: BoardDeps, onlyId?: string): Promise<BoardsSyncResult> {
  const companies = (await deps.db.companies.toArray()).filter(
    (c) => c.enabled && (onlyId === undefined || c.id === onlyId),
  );
  const result: BoardsSyncResult = { companies: companies.length, failed: 0, added: 0, closed: 0 };
  for (const company of companies) {
    try {
      const r = await syncCompany(deps, company);
      result.added += r.added;
      result.closed += r.closed;
    } catch {
      result.failed++;
    }
  }
  return result;
}
