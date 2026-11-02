import type { Project } from "@job-copilot/shared";
import { describe, expect, it } from "vitest";
import { projectsForPicking } from "@/lib/ai/tasks/pickProjects";
import { finalizePicks, rankProjectsLocally } from "@/lib/resume/pick";

function project(id: string, techStack: string[], extra: Partial<Project> = {}): Project {
  return {
    id,
    name: `Project ${id}`,
    description: "A project",
    bullets: [],
    techStack,
    links: {},
    source: "manual",
    included: true,
    highlight: false,
    updatedAt: "2026-01-01T00:00:00Z",
    ...extra,
  };
}

const analysis = { mustHave: ["React", "Node.js"], keywords: ["PostgreSQL", "REST APIs"] };

const projects = [
  project("a", ["python", "django"], { updatedAt: "2026-10-01T00:00:00Z" }),
  project("b", ["react", "nodejs", "postgresql"]),
  project("c", ["react"], { updatedAt: "2026-09-01T00:00:00Z" }),
  project("d", ["react", "nodejs"], { included: false }),
  project("e", ["go"], { highlight: true }),
];

describe("local project ranking", () => {
  it("ranks real projects by skill overlap, then recency", () => {
    expect(rankProjectsLocally(projects, analysis).map((r) => r.project.id)).toEqual([
      "b",
      "c",
      "a",
      "e",
    ]);
  });

  it("always picks highlighted projects and counts them toward N", () => {
    const picks = finalizePicks(projects, analysis, 2);
    expect(picks.map((p) => p.projectId)).toEqual(["e", "b"]);
    expect(picks[1]?.matchedKeywords).toEqual(["React", "Node.js", "PostgreSQL"]);
  });
});

describe("AI picks are checked by code", () => {
  it("ignores unknown keys and projects that are not real, then fills from the ranking", () => {
    const candidates = projects.filter((p) => p.included && !p.highlight);
    const sent = projectsForPicking(candidates);
    const keys = new Map(sent.map((p, i) => [p.key, candidates[i]?.id ?? ""]));
    keys.set("p9", "d"); // a key pointing at a project the user did not mark as real
    const picks = finalizePicks(projects, analysis, 3, {
      keys,
      output: {
        picked: [
          { key: "p99", reason: "Invented", matchedKeywords: [] },
          { key: "p9", reason: "Not real", matchedKeywords: [] },
          { key: "p1", reason: "Shows Python skills", matchedKeywords: ["Python"] },
        ],
      },
    });
    expect(picks.map((p) => p.projectId)).toEqual(["e", "a", "b"]);
    expect(picks[1]?.reason).toBe("Shows Python skills");
  });

  it("clips project descriptions sent to the AI", () => {
    const [sent] = projectsForPicking([project("x", ["react"], { description: "y".repeat(900) })]);
    expect(sent?.key).toBe("p1");
    expect(sent?.description.length).toBeLessThanOrEqual(401);
    expect(sent?.techStack).toEqual(["React"]);
  });
});
