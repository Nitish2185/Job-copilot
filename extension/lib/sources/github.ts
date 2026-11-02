/**
 * GitHub project import (spec 10, step 4). Unauthenticated requests are limited
 * to 60 an hour, so languages and READMEs are fetched only for ticked repos. An
 * optional token (no scopes needed for public data) raises the limit.
 */
import type { Project } from "@job-copilot/shared";
import { z } from "zod";
import { skillIdsFor } from "../ai/skillIds";
import { jaccard } from "../answers/answerBank";

const API = "https://api.github.com";
const MAX_PAGES = 5;
export const README_LIMIT = 2000;

export interface GithubRepo {
  fullName: string;
  name: string;
  description: string;
  language: string | null;
  stars: number;
  forks: number;
  isFork: boolean;
  archived: boolean;
  pushedAt: string;
  htmlUrl: string;
  homepage: string | null;
  topics: string[];
}

export interface GithubDetails {
  languages: Record<string, number>;
  readmeExcerpt: string;
}

export class GithubError extends Error {
  override name = "GithubError";
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

const RepoSchema = z.object({
  full_name: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  language: z.string().nullish(),
  stargazers_count: z.number(),
  forks_count: z.number(),
  fork: z.boolean(),
  archived: z.boolean(),
  pushed_at: z.string().nullish(),
  html_url: z.string(),
  homepage: z.string().nullish(),
  topics: z.array(z.string()).nullish(),
});

export interface GithubDeps {
  fetch: typeof fetch;
  token?: string;
}

function headers(deps: GithubDeps, accept = "application/vnd.github+json"): Record<string, string> {
  return deps.token
    ? { Accept: accept, Authorization: `Bearer ${deps.token}` }
    : { Accept: accept };
}

/** X-RateLimit-Remaining from the last response, for the "requests left" display. */
export function rateRemaining(res: Response): number | undefined {
  const value = res.headers.get("x-ratelimit-remaining");
  return value === null ? undefined : Number(value);
}

function check(res: Response): Response {
  if (res.ok) return res;
  if (res.status === 404) throw new GithubError("GitHub user not found.", 404);
  if (res.status === 403 || res.status === 429) {
    throw new GithubError(
      "GitHub's hourly request limit was reached. Try again later or add a token.",
      res.status,
    );
  }
  throw new GithubError(`GitHub answered HTTP ${String(res.status)}.`, res.status);
}

/** The user's public repositories, most recently pushed first. */
export async function listRepos(
  deps: GithubDeps,
  username: string,
): Promise<{ repos: GithubRepo[]; remaining?: number }> {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(username)) {
    throw new GithubError("That is not a valid GitHub username.");
  }
  const repos: GithubRepo[] = [];
  let remaining: number | undefined;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = check(
      await deps.fetch(
        `${API}/users/${encodeURIComponent(username)}/repos?per_page=100&sort=pushed&page=${String(page)}`,
        { headers: headers(deps) },
      ),
    );
    remaining = rateRemaining(res) ?? remaining;
    const pageRepos = z.array(RepoSchema).parse(await res.json());
    for (const r of pageRepos) {
      repos.push({
        fullName: r.full_name,
        name: r.name,
        description: r.description ?? "",
        language: r.language ?? null,
        stars: r.stargazers_count,
        forks: r.forks_count,
        isFork: r.fork,
        archived: r.archived,
        pushedAt: r.pushed_at ?? "",
        htmlUrl: r.html_url,
        homepage: r.homepage ?? null,
        topics: r.topics ?? [],
      });
    }
    if (pageRepos.length < 100) break;
  }
  return remaining === undefined ? { repos } : { repos, remaining };
}

/** Languages and the first 2000 characters of the README for one repo. */
export async function repoDetails(deps: GithubDeps, fullName: string): Promise<GithubDetails> {
  const languagesRes = check(
    await deps.fetch(`${API}/repos/${fullName}/languages`, { headers: headers(deps) }),
  );
  const languages = z.record(z.string(), z.number()).parse(await languagesRes.json());
  const readmeRes = await deps.fetch(`${API}/repos/${fullName}/readme`, {
    headers: headers(deps, "application/vnd.github.raw"),
  });
  const readme = readmeRes.ok ? await readmeRes.text() : "";
  return { languages, readmeExcerpt: readme.slice(0, README_LIMIT) };
}

/** Forks and archived repos start unticked. */
export function tickedByDefault(repo: GithubRepo): boolean {
  return !repo.isFork && !repo.archived;
}

function httpUrl(value: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** A project prefilled from repo data; used as is when AI is off (spec 10, step 4). */
export function projectFromRepo(repo: GithubRepo, details: GithubDetails, now: Date): Project {
  const live = httpUrl(repo.homepage);
  const pushedAt = Date.parse(repo.pushedAt);
  return {
    id: crypto.randomUUID(),
    name: repo.name,
    description: repo.description,
    bullets: [],
    techStack: skillIdsFor([...Object.keys(details.languages), ...repo.topics]),
    links: { repo: repo.htmlUrl, ...(live && { live }) },
    source: "github",
    github: {
      fullName: repo.fullName,
      stars: repo.stars,
      forks: repo.forks,
      isFork: repo.isFork,
      archived: repo.archived,
      languages: details.languages,
      topics: repo.topics,
      readmeExcerpt: details.readmeExcerpt,
      pushedAt: new Date(Number.isNaN(pushedAt) ? now.getTime() : pushedAt)
        .toISOString()
        .replace(/\.\d{3}Z$/, "Z"),
    },
    included: true,
    highlight: false,
    updatedAt: now.toISOString().replace(/\.\d{3}Z$/, "Z"),
  };
}

function sameProject(a: Project, b: Project): boolean {
  const repoA = a.links.repo?.toLowerCase().replace(/\/$/, "");
  const repoB = b.links.repo?.toLowerCase().replace(/\/$/, "");
  if (repoA && repoB) return repoA === repoB;
  const nameA = a.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const nameB = b.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return nameA === nameB || jaccard(nameA, nameB) >= 0.8;
}

/**
 * Adds imported projects, merging each with a matching existing project (same
 * repo URL or a very similar name) instead of creating a duplicate. The user's
 * own text wins; GitHub data and links are added.
 */
export function mergeProjects(
  existing: readonly Project[],
  incoming: readonly Project[],
): Project[] {
  const out = [...existing];
  for (const project of incoming) {
    const index = out.findIndex((p) => sameProject(p, project));
    const match = index >= 0 ? out[index] : undefined;
    if (!match) {
      out.push(project);
      continue;
    }
    out[index] = {
      ...match,
      description: match.description || project.description,
      bullets: match.bullets.length > 0 ? match.bullets : project.bullets,
      techStack: [...new Set([...match.techStack, ...project.techStack])],
      links: { ...project.links, ...match.links },
      ...(project.github && { github: project.github }),
      updatedAt: project.updatedAt,
    };
  }
  return out;
}
