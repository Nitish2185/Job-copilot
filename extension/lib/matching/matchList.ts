/**
 * Filtering, sorting and skill gaps for the Matches page (spec 18.1, 12.3).
 * Pure functions so they are easy to test and fast on 10,000 jobs.
 */
import type { ApplyMode, Job, JobPlatform, JobScore, Remote } from "@job-copilot/shared";
import { skillIdFor } from "../ai/skillIds";

export interface MatchRow {
  job: Job;
  score?: JobScore;
}

export type StatusFilter = "open" | "saved" | "applied" | "hidden" | "closed";
export type MatchSort = "score" | "date" | "company";

export interface MatchFilters {
  query: string;
  /** Minimum final score; ignored when `showAll` is on or the profile is not set up. */
  minScore: number;
  showAll: boolean;
  mode: "all" | ApplyMode;
  platform: "all" | JobPlatform;
  country: string;
  remote: "all" | Remote;
  /** null: any time. */
  postedWithinDays: number | null;
  company: string;
  hasSalary: boolean;
  status: StatusFilter;
  sort: MatchSort;
}

export function defaultFilters(minScore: number): MatchFilters {
  return {
    query: "",
    minScore,
    showAll: false,
    mode: "all",
    platform: "all",
    country: "",
    remote: "all",
    postedWithinDays: null,
    company: "",
    hasSalary: false,
    status: "open",
    sort: "score",
  };
}

const STATUS_GROUPS: Record<StatusFilter, ReadonlySet<Job["status"]>> = {
  open: new Set(["new", "saved", "queued", "needs_you", "applied"]),
  saved: new Set(["saved"]),
  applied: new Set(["applied", "queued", "needs_you"]),
  hidden: new Set(["hidden"]),
  closed: new Set(["closed"]),
};

export const postedAt = (job: Job): string => job.postedAt ?? job.firstSeenAt;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Rows to show. `ranked` is false until the profile has skills; then scores are
 * not meaningful and the score threshold is skipped. Jobs removed by a hard
 * filter from the preferences never show.
 */
export function filterMatches(
  rows: readonly MatchRow[],
  f: MatchFilters,
  now: Date,
  ranked: boolean,
): MatchRow[] {
  const query = f.query.trim().toLowerCase();
  const company = f.company.trim().toLowerCase();
  const country = f.country.toUpperCase();
  const statuses = STATUS_GROUPS[f.status];
  const since =
    f.postedWithinDays === null ? null : new Date(now.getTime() - f.postedWithinDays * DAY_MS);
  const useThreshold = ranked && !f.showAll;
  return rows.filter(({ job, score }) => {
    if (!statuses.has(job.status)) return false;
    if (score?.prefilter.excluded && f.status !== "closed") return false;
    if (useThreshold && (score === undefined || score.final < f.minScore)) return false;
    if (f.mode !== "all" && job.mode !== f.mode) return false;
    if (f.platform !== "all" && job.platform !== f.platform) return false;
    if (country !== "" && !job.countryCodes.includes(country)) return false;
    if (f.remote !== "all" && job.remote !== f.remote) return false;
    if (since && new Date(postedAt(job)) < since) return false;
    if (company !== "" && !job.company.name.toLowerCase().includes(company)) return false;
    if (f.hasSalary && !job.salary) return false;
    if (query !== "") {
      const text = `${job.title} ${job.company.name} ${job.locations.join(" ")} ${job.skills.join(" ")}`;
      if (!text.toLowerCase().includes(query)) return false;
    }
    return true;
  });
}

export function sortMatches(rows: MatchRow[], sort: MatchSort): MatchRow[] {
  const byDate = (a: MatchRow, b: MatchRow) => postedAt(b.job).localeCompare(postedAt(a.job));
  const byScore = (a: MatchRow, b: MatchRow) => (b.score?.final ?? -1) - (a.score?.final ?? -1);
  return rows.sort((a, b) => {
    if (sort === "date") return byDate(a, b) || byScore(a, b);
    if (sort === "company") {
      return a.job.company.name.localeCompare(b.job.company.name) || byScore(a, b) || byDate(a, b);
    }
    return byScore(a, b) || byDate(a, b);
  });
}

export interface SkillGap {
  skill: string;
  /** How many of the top jobs ask for it. */
  jobs: number;
}

/**
 * Skills missing from the profile across the user's best jobs (spec 12.3):
 * prefilter missing skills plus unmet AI must-haves, counted once per job.
 */
export function skillGaps(rows: readonly MatchRow[], top = 100, limit = 8): SkillGap[] {
  const best = rows
    .filter((r) => r.score && !r.score.prefilter.excluded && r.job.status !== "closed")
    .sort((a, b) => (b.score?.final ?? 0) - (a.score?.final ?? 0))
    .slice(0, top);
  const counts = new Map<string, number>();
  for (const { score } of best) {
    if (!score) continue;
    const missing = new Set(score.prefilter.missingSkills);
    for (const item of score.ai?.mustHave ?? []) {
      const id = item.met ? undefined : skillIdFor(item.skill);
      if (id) missing.add(id);
    }
    for (const id of missing) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts]
    .map(([skill, jobs]) => ({ skill, jobs }))
    .sort((a, b) => b.jobs - a.jobs || a.skill.localeCompare(b.skill))
    .slice(0, limit);
}
