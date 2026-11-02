/** writeCoverLetter (spec 11.7 #7, 15.1): job analysis + profile summary + picked projects -> plain text. */
import {
  skillDisplayName,
  type JdAnalysis,
  type Job,
  type Profile,
  type Project,
} from "@job-copilot/shared";
import { z } from "zod";
import { CACHE_TTL } from "../cache";
import { NO_INVENTION_RULE, UNTRUSTED_DATA_RULE, clip } from "../prompts/common";
import type { AiTask } from "../runner";

export const CoverLetterOutputSchema = z.object({ text: z.string().min(1).max(3000) });
export type CoverLetterOutput = z.infer<typeof CoverLetterOutputSchema>;

export interface CoverLetterInput {
  job: {
    title: string;
    company: string;
    mustHave: string[];
    keywords: string[];
    responsibilities: string;
  };
  candidate: {
    headline: string;
    summary: string;
    totalYears: number;
    skills: string[];
    recentRoles: { title: string; company: string }[];
    projects: { name: string; description: string; bullets: string[]; techStack: string[] }[];
  };
}

export function coverLetterInput(
  profile: Profile,
  job: Pick<Job, "title" | "company">,
  analysis: JdAnalysis,
  picked: readonly Project[],
): CoverLetterInput {
  return {
    job: {
      title: job.title,
      company: job.company.name,
      mustHave: analysis.mustHave,
      keywords: analysis.keywords,
      responsibilities: analysis.responsibilitiesSummary,
    },
    candidate: {
      headline: profile.headline ?? "",
      summary: profile.summary,
      totalYears: Math.floor(profile.totalExperienceMonths / 12),
      skills: profile.skills.map((s) => s.displayName),
      recentRoles: profile.experience
        .slice(0, 3)
        .map((e) => ({ title: e.title, company: e.company })),
      projects: picked.map((p) => ({
        name: p.name,
        description: clip(p.description, 400),
        bullets: p.bullets,
        techStack: p.techStack.map(skillDisplayName),
      })),
    },
  };
}

export const writeCoverLetterTask: AiTask<CoverLetterInput, CoverLetterOutput> = {
  id: "writeCoverLetter",
  promptVersion: 1,
  schema: CoverLetterOutputSchema,
  cacheTtlMs: CACHE_TTL.writeCoverLetter,
  redactInput: true,
  priority: "user",
  buildMessages: ({ job, candidate }) => [
    {
      role: "system",
      content: [
        "You write a short cover letter for a software job.",
        UNTRUSTED_DATA_RULE,
        NO_INVENTION_RULE,
        `Plain text, 150-250 words, addressed to the ${job.company} hiring team. Mention the candidate's picked projects and the job's key requirements the candidate actually meets. No skills, numbers, employers or certifications that are not in the candidate data. No placeholders such as [Your Name]; end with "Kind regards," and nothing after it.`,
      ].join("\n"),
    },
    {
      role: "user",
      content: `<job_description>${JSON.stringify(job)}</job_description>\n<candidate>${JSON.stringify(candidate)}</candidate>`,
    },
  ],
};
