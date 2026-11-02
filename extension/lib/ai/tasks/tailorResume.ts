/**
 * tailorResume (spec 11.7 #6, 14.3): structured changes only. Jobs and projects
 * get short keys (e1, p1...) that code maps back; everything the AI returns is
 * checked by the validator before it is used.
 */
import type { JdAnalysis, Job, Profile, Project } from "@job-copilot/shared";
import { skillDisplayName } from "@job-copilot/shared";
import { z } from "zod";
import { CACHE_TTL } from "../cache";
import { NO_INVENTION_RULE, UNTRUSTED_DATA_RULE, clip } from "../prompts/common";
import type { AiTask } from "../runner";
import type { TailorChanges } from "../../resume/tailor";

export const TailorResumeOutputSchema = z.object({
  summary: z.string().max(600),
  skillsOrder: z.array(z.string()).max(60),
  experienceRewrites: z
    .array(
      z.object({
        experienceKey: z.string(),
        bulletIndex: z.number().int().min(0),
        text: z.string().max(400),
      }),
    )
    .max(60),
  experienceBulletOrder: z
    .array(z.object({ experienceKey: z.string(), order: z.array(z.number().int().min(0)).max(30) }))
    .max(20),
  projectBullets: z
    .array(z.object({ projectKey: z.string(), bullets: z.array(z.string().max(400)).max(6) }))
    .max(3),
  keywordsTargeted: z.array(z.string().max(60)).max(25),
});
export type TailorResumeOutput = z.infer<typeof TailorResumeOutputSchema>;

export interface TailorResumeInput {
  job: {
    title: string;
    mustHave: string[];
    niceToHave: string[];
    keywords: string[];
    seniority: string;
    responsibilities: string;
  };
  candidate: {
    headline: string;
    summary: string;
    totalYears: number;
    skills: { id: string; name: string; years?: number }[];
    experience: { key: string; title: string; company: string; bullets: string[] }[];
    projects: {
      key: string;
      name: string;
      description: string;
      bullets: string[];
      techStack: string[];
    }[];
  };
}

/** Builds the request and the key -> ID maps used to read the answer. */
export function tailorRequest(
  profile: Profile,
  picked: readonly Project[],
  job: Pick<Job, "title">,
  analysis: JdAnalysis,
): {
  input: TailorResumeInput;
  experienceKeys: Map<string, string>;
  projectKeys: Map<string, string>;
} {
  const experienceKeys = new Map(profile.experience.map((e, i) => [`e${String(i + 1)}`, e.id]));
  const projectKeys = new Map(picked.map((p, i) => [`p${String(i + 1)}`, p.id]));
  return {
    experienceKeys,
    projectKeys,
    input: {
      job: {
        title: job.title,
        mustHave: analysis.mustHave,
        niceToHave: analysis.niceToHave,
        keywords: analysis.keywords,
        seniority: analysis.seniority,
        responsibilities: analysis.responsibilitiesSummary,
      },
      candidate: {
        headline: profile.headline ?? "",
        summary: profile.summary,
        totalYears: Math.round((profile.totalExperienceMonths / 12) * 10) / 10,
        skills: profile.skills.map((s) => ({
          id: s.id,
          name: s.displayName,
          ...(s.years !== undefined && { years: s.years }),
        })),
        experience: profile.experience.map((e, i) => ({
          key: `e${String(i + 1)}`,
          title: e.title,
          company: e.company,
          bullets: e.bullets,
        })),
        projects: picked.map((p, i) => ({
          key: `p${String(i + 1)}`,
          name: p.name,
          description: clip(p.description, 400),
          bullets: p.bullets,
          techStack: p.techStack.map(skillDisplayName),
        })),
      },
    },
  };
}

/** Maps the AI's keys back to profile IDs; unknown keys stay unknown and are rejected later. */
export function changesFromOutput(
  output: TailorResumeOutput,
  experienceKeys: ReadonlyMap<string, string>,
  projectKeys: ReadonlyMap<string, string>,
): TailorChanges {
  const exp = (key: string) => experienceKeys.get(key) ?? `unknown:${key}`;
  const proj = (key: string) => projectKeys.get(key) ?? `unknown:${key}`;
  return {
    summary: output.summary,
    skillsOrder: output.skillsOrder,
    experienceRewrites: output.experienceRewrites.map((r) => ({
      experienceId: exp(r.experienceKey),
      bulletIndex: r.bulletIndex,
      text: r.text,
    })),
    experienceBulletOrder: output.experienceBulletOrder.map((o) => ({
      experienceId: exp(o.experienceKey),
      order: o.order,
    })),
    projectBullets: output.projectBullets.map((p) => ({
      projectId: proj(p.projectKey),
      bullets: p.bullets,
    })),
    keywordsTargeted: output.keywordsTargeted,
  };
}

export const tailorResumeTask: AiTask<TailorResumeInput, TailorResumeOutput> = {
  id: "tailorResume",
  promptVersion: 1,
  schema: TailorResumeOutputSchema,
  cacheTtlMs: CACHE_TTL.tailorResume,
  redactInput: true,
  priority: "user",
  buildMessages: ({ job, candidate }) => [
    {
      role: "system",
      content: [
        "You tailor a resume to one job by rewording and reordering what is already there.",
        UNTRUSTED_DATA_RULE,
        NO_INVENTION_RULE,
        "Never add a skill, tool, number, metric, employer, product or certification that is not in the candidate data. Never change companies, titles or dates.",
        "summary: at most 60 words, aimed at this job. skillsOrder: candidate skill ids, most relevant first; you may leave some out.",
        "experienceRewrites: rephrase existing bullets (bulletIndex is the bullet's position, from 0) to stress what the job wants; each at most 30 words. experienceBulletOrder: the bullet positions in the best order.",
        "projectBullets: 2-4 bullets per project, using only that project's own description, bullets and tech stack. keywordsTargeted: job keywords the tailored resume now mentions.",
      ].join("\n"),
    },
    {
      role: "user",
      content: `<job_description>${JSON.stringify(job)}</job_description>\n<candidate>${JSON.stringify(candidate)}</candidate>`,
    },
  ],
};
