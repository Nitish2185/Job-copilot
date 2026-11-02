import { describe, expect, it } from "vitest";
import { listReposCached, repoDetailsCached } from "@/lib/sources/githubCache";

const DAY = 24 * 60 * 60 * 1000;
const start = new Date("2026-11-02T06:00:00Z");

const apiRepo = {
  full_name: "aarav-dev/notes",
  name: "notes",
  description: "Notes app",
  language: "Go",
  stargazers_count: 1,
  forks_count: 0,
  fork: false,
  archived: false,
  pushed_at: "2026-10-01T10:00:00Z",
  html_url: "https://github.com/aarav-dev/notes",
  homepage: null,
  topics: [],
};

function countingFetch(): { fetch: typeof fetch; urls: string[] } {
  const urls: string[] = [];
  const fetchFn: typeof fetch = (input) => {
    const url = input instanceof Request ? input.url : input.toString();
    urls.push(url);
    if (url.includes("/users/")) return Promise.resolve(Response.json([apiRepo]));
    if (url.endsWith("/languages")) return Promise.resolve(Response.json({ Go: 1200 }));
    return Promise.resolve(new Response("# Notes\nA small notes app."));
  };
  return { fetch: fetchFn, urls };
}

describe("GitHub cache", () => {
  it("reuses the repo list for a week, then fetches again", async () => {
    const api = countingFetch();
    await listReposCached(api, "Aarav-Dev", { now: start });
    const second = await listReposCached(api, "aarav-dev", {
      now: new Date(start.getTime() + DAY),
    });
    expect(api.urls).toHaveLength(1);
    expect(second.repos[0]?.name).toBe("notes");
    expect(second.cachedAt).toEqual(start);

    await listReposCached(api, "aarav-dev", { now: new Date(start.getTime() + 8 * DAY) });
    expect(api.urls).toHaveLength(2);
    await listReposCached(api, "aarav-dev", {
      now: new Date(start.getTime() + 8 * DAY),
      refresh: true,
    });
    expect(api.urls).toHaveLength(3);
  });

  it("caches README details until the repo is pushed again", async () => {
    const api = countingFetch();
    const { repos } = await listReposCached(api, "aarav-dev", { now: start });
    const repo = repos[0];
    if (!repo) throw new Error("expected a repo");
    const first = await repoDetailsCached(api, repo, start);
    await repoDetailsCached(api, repo, start);
    expect(first.languages).toEqual({ Go: 1200 });
    expect(api.urls).toHaveLength(3);

    await repoDetailsCached(api, { ...repo, pushedAt: "2026-11-01T10:00:00Z" }, start);
    expect(api.urls).toHaveLength(5);
  });
});
