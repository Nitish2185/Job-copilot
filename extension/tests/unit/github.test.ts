import type { Project } from "@job-copilot/shared";
import { describe, expect, it } from "vitest";
import {
  GithubError,
  listRepos,
  mergeProjects,
  projectFromRepo,
  repoDetails,
  tickedByDefault,
  type GithubRepo,
} from "@/lib/sources/github";

const now = new Date("2026-11-02T06:00:00Z");

const apiRepo = (name: string, extra: Record<string, unknown> = {}) => ({
  full_name: `aarav-dev/${name}`,
  name,
  description: `${name} description`,
  language: "TypeScript",
  stargazers_count: 3,
  forks_count: 1,
  fork: false,
  archived: false,
  pushed_at: "2026-10-01T10:00:00Z",
  html_url: `https://github.com/aarav-dev/${name}`,
  homepage: null,
  topics: ["react"],
  ...extra,
});

function fakeFetch(
  routes: Record<string, { status?: number; body: unknown; headers?: Record<string, string> }>,
  log: { url: string; headers: Headers }[],
): typeof fetch {
  return (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    log.push({ url, headers: new Headers(init?.headers) });
    const route = routes[url];
    if (!route) return Promise.resolve(new Response("not found", { status: 404 }));
    const body = typeof route.body === "string" ? route.body : JSON.stringify(route.body);
    return Promise.resolve(
      new Response(body, { status: route.status ?? 200, headers: route.headers }),
    );
  };
}

describe("listRepos", () => {
  it("lists repos newest first and reports the remaining rate limit", async () => {
    const log: { url: string; headers: Headers }[] = [];
    const fetch = fakeFetch(
      {
        "https://api.github.com/users/aarav-dev/repos?per_page=100&sort=pushed&page=1": {
          body: [apiRepo("job-board"), apiRepo("old-fork", { fork: true })],
          headers: { "x-ratelimit-remaining": "57" },
        },
      },
      log,
    );
    const result = await listRepos({ fetch }, "aarav-dev");
    expect(result.remaining).toBe(57);
    expect(result.repos.map((r) => r.name)).toEqual(["job-board", "old-fork"]);
    expect(result.repos.map(tickedByDefault)).toEqual([true, false]);
    expect(log[0]?.headers.get("Authorization")).toBeNull();
  });

  it("sends the optional token and explains rate limits and missing users", async () => {
    const log: { url: string; headers: Headers }[] = [];
    const limited = fakeFetch(
      {
        "https://api.github.com/users/aarav-dev/repos?per_page=100&sort=pushed&page=1": {
          status: 403,
          body: {},
        },
      },
      log,
    );
    await expect(listRepos({ fetch: limited, token: "t0k" }, "aarav-dev")).rejects.toThrow(
      /hourly request limit/,
    );
    expect(log[0]?.headers.get("Authorization")).toBe("Bearer t0k");
    await expect(listRepos({ fetch: fakeFetch({}, []) }, "nobody")).rejects.toThrow(
      "GitHub user not found.",
    );
    await expect(listRepos({ fetch: fakeFetch({}, []) }, "bad name!")).rejects.toBeInstanceOf(
      GithubError,
    );
  });
});

describe("repoDetails and projectFromRepo", () => {
  it("fetches languages and the first 2000 README characters, then prefills a project", async () => {
    const fetch = fakeFetch(
      {
        "https://api.github.com/repos/aarav-dev/job-board/languages": {
          body: { TypeScript: 9000, CSS: 500 },
        },
        "https://api.github.com/repos/aarav-dev/job-board/readme": {
          body: `# Job board\n${"x".repeat(3000)}`,
        },
      },
      [],
    );
    const details = await repoDetails({ fetch }, "aarav-dev/job-board");
    expect(details.readmeExcerpt).toHaveLength(2000);
    const repo: GithubRepo = {
      fullName: "aarav-dev/job-board",
      name: "job-board",
      description: "A job board",
      language: "TypeScript",
      stars: 3,
      forks: 0,
      isFork: false,
      archived: false,
      pushedAt: "2026-10-01T10:00:00Z",
      htmlUrl: "https://github.com/aarav-dev/job-board",
      homepage: "jobs.example.com",
      topics: ["react", "nextjs"],
    };
    const project = projectFromRepo(repo, details, now);
    expect(project).toMatchObject({
      name: "job-board",
      description: "A job board",
      source: "github",
      links: { repo: "https://github.com/aarav-dev/job-board", live: "https://jobs.example.com/" },
    });
    expect(project.techStack).toEqual(["typescript", "css", "react", "nextjs"]);
  });

  it("works without a README", async () => {
    const fetch = fakeFetch({ "https://api.github.com/repos/a/b/languages": { body: {} } }, []);
    expect((await repoDetails({ fetch }, "a/b")).readmeExcerpt).toBe("");
  });
});

describe("mergeProjects", () => {
  const resumeProject: Project = {
    id: "p1",
    name: "Job Board",
    description: "My words",
    bullets: ["Built search"],
    techStack: ["nextjs"],
    links: {},
    source: "resume",
    included: true,
    highlight: true,
    updatedAt: "2026-01-01T00:00:00Z",
  };

  it("merges a repo into the matching resume project instead of duplicating it", () => {
    const imported: Project = {
      ...resumeProject,
      id: "p2",
      name: "job-board",
      description: "Repo text",
      bullets: [],
      techStack: ["postgresql"],
      links: { repo: "https://github.com/aarav-dev/job-board" },
      source: "github",
    };
    const merged = mergeProjects([resumeProject], [imported]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      id: "p1",
      description: "My words",
      bullets: ["Built search"],
      techStack: ["nextjs", "postgresql"],
      links: { repo: "https://github.com/aarav-dev/job-board" },
      highlight: true,
    });
  });

  it("adds unrelated projects", () => {
    const other: Project = { ...resumeProject, id: "p3", name: "Weather CLI", links: {} };
    expect(mergeProjects([resumeProject], [other])).toHaveLength(2);
  });
});
