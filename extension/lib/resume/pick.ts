/**
 * Choosing projects for a tailored resume (spec 14.2 step 2). Only real projects
 * (`included`) are candidates; "Always include" projects (`highlight`) are always
 * picked and count toward N. The AI's picks are checked by code; without AI the
 * projects are ranked by skill overlap with the job, then by recency.
 */
import { skillDisplayName, type JdAnalysis, type Project } from "@job-copilot/shared";
import { skillIdsFor } from "../ai/skillIds";
import type { PickProjectsOutput } from "../ai/tasks/pickProjects";

export interface ProjectPick {
  projectId: string;
  reason: string;
  matchedKeywords: string[];
}

/** Skill IDs the job asks for: must-haves and keywords. */
export function jobSkillIds(analysis: Pick<JdAnalysis, "mustHave" | "keywords">): Set<string> {
  return new Set(skillIdsFor([...analysis.mustHave, ...analysis.keywords]));
}

function lastActive(p: Project): string {
  return p.github?.pushedAt ?? p.updatedAt;
}

/** Real projects ranked by overlap with the job's skills, then by most recent activity. */
export function rankProjectsLocally(
  projects: readonly Project[],
  analysis: Pick<JdAnalysis, "mustHave" | "keywords">,
): { project: Project; matched: string[] }[] {
  const wanted = jobSkillIds(analysis);
  return projects
    .filter((p) => p.included)
    .map((project) => ({ project, matched: project.techStack.filter((s) => wanted.has(s)) }))
    .sort(
      (a, b) =>
        b.matched.length - a.matched.length ||
        lastActive(b.project).localeCompare(lastActive(a.project)),
    );
}

function localReason(matched: readonly string[]): string {
  return matched.length > 0
    ? `Uses ${String(matched.length)} of the job's skills`
    : "One of your most recent projects";
}

/**
 * The final picks: highlighted projects first, then valid AI picks, then the
 * local ranking until N projects are chosen.
 */
export function finalizePicks(
  projects: readonly Project[],
  analysis: Pick<JdAnalysis, "mustHave" | "keywords">,
  count: number,
  ai?: { output: PickProjectsOutput; keys: ReadonlyMap<string, string> },
): ProjectPick[] {
  const ranked = rankProjectsLocally(projects, analysis);
  const byId = new Map(ranked.map((r) => [r.project.id, r]));
  const picks: ProjectPick[] = [];
  const add = (pick: ProjectPick) => {
    if (picks.length < count && !picks.some((p) => p.projectId === pick.projectId)) {
      picks.push(pick);
    }
  };

  for (const r of ranked.filter((r) => r.project.highlight)) {
    add({
      projectId: r.project.id,
      reason: "You chose to always include it",
      matchedKeywords: r.matched.map(skillDisplayName),
    });
  }
  for (const item of ai?.output.picked ?? []) {
    const id = ai?.keys.get(item.key);
    // Code decides: unknown keys and projects that are not real are ignored.
    if (id && byId.has(id)) {
      add({ projectId: id, reason: item.reason, matchedKeywords: item.matchedKeywords });
    }
  }
  for (const r of ranked) {
    add({
      projectId: r.project.id,
      reason: localReason(r.matched),
      matchedKeywords: r.matched.map(skillDisplayName),
    });
  }
  return picks;
}
