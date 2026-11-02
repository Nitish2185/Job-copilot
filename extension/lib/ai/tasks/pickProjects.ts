/**
 * pickProjects (spec 11.7 #5): the job analysis + the user's real projects -> the
 * N most relevant ones. Projects get short keys (p1, p2...); code maps them back
 * and checks every pick.
 */
import { skillDisplayName, type JdAnalysis, type Project } from "@job-copilot/shared";
import { z } from "zod";
import { CACHE_TTL } from "../cache";
import { NO_INVENTION_RULE, UNTRUSTED_DATA_RULE, clip } from "../prompts/common";
import type { AiTask } from "../runner";

export const PickProjectsOutputSchema = z.object({
  picked: z
    .array(
      z.object({
        key: z.string().min(1),
        reason: z.string().max(160),
        matchedKeywords: z.array(z.string()).max(10),
      }),
    )
    .max(5),
});
export type PickProjectsOutput = z.infer<typeof PickProjectsOutputSchema>;

export interface PickProjectsInput {
  job: Pick<JdAnalysis, "mustHave" | "niceToHave" | "keywords" | "responsibilitiesSummary">;
  projects: {
    key: string;
    name: string;
    description: string;
    bullets: string[];
    techStack: string[];
  }[];
  count: number;
}

/** Project data sent to the AI (descriptions clipped to 400 characters, spec 11.8). */
export function projectsForPicking(projects: readonly Project[]): PickProjectsInput["projects"] {
  return projects.map((p, i) => ({
    key: `p${String(i + 1)}`,
    name: p.name,
    description: clip(p.description, 400),
    bullets: p.bullets.map((b) => clip(b, 220)),
    techStack: p.techStack.map(skillDisplayName),
  }));
}

export const pickProjectsTask: AiTask<PickProjectsInput, PickProjectsOutput> = {
  id: "pickProjects",
  promptVersion: 1,
  schema: PickProjectsOutputSchema,
  cacheTtlMs: CACHE_TTL.pickProjects,
  redactInput: true,
  priority: "user",
  buildMessages: ({ job, projects, count }) => [
    {
      role: "system",
      content: [
        `You pick the ${String(count)} projects that best show the candidate fits this job. Use the project keys.`,
        UNTRUSTED_DATA_RULE,
        NO_INVENTION_RULE,
        "reason: one short sentence on why it fits. matchedKeywords: job keywords the project really shows.",
      ].join("\n"),
    },
    {
      role: "user",
      content: `<job_description>${JSON.stringify(job)}</job_description>\n<projects>${JSON.stringify(projects)}</projects>`,
    },
  ],
};
