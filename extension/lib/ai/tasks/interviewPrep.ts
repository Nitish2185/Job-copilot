/**
 * interviewPrep (spec 11.7 #10, 15.2): JD analysis + profile + picked projects ->
 * likely questions, talking points per project, skills to brush up on and
 * questions to ask the interviewer.
 */
import {
  skillDisplayName,
  type InterviewPrep,
  type JdAnalysis,
  type Job,
  type Profile,
  type Project,
} from "@job-copilot/shared";
import { z } from "zod";
import { NO_INVENTION_RULE, UNTRUSTED_DATA_RULE, clip } from "../prompts/common";
import type { AiTask } from "../runner";

export const InterviewPrepOutputSchema = z.object({
  technical: z.array(z.string().min(1).max(300)).min(1).max(8),
  behavioral: z.array(z.string().min(1).max(300)).min(1).max(6),
  talkingPoints: z
    .array(z.object({ project: z.string().min(1), points: z.array(z.string().max(300)).max(4) }))
    .max(3),
  brushUp: z.array(z.string().min(1).max(120)).max(6),
  askThem: z.array(z.string().min(1).max(300)).min(1).max(5),
});
export type InterviewPrepOutput = z.infer<typeof InterviewPrepOutputSchema>;

export interface InterviewPrepInput {
  job: {
    title: string;
    company: string;
    mustHave: string[];
    niceToHave: string[];
    responsibilities: string;
    seniority: string;
  };
  candidate: {
    headline: string;
    totalYears: number;
    skills: string[];
    recentRoles: { title: string; company: string }[];
    projects: { name: string; description: string; bullets: string[]; techStack: string[] }[];
  };
}

export function interviewPrepInput(
  profile: Profile,
  job: Pick<Job, "title" | "company">,
  analysis: JdAnalysis,
  picked: readonly Project[],
): InterviewPrepInput {
  return {
    job: {
      title: job.title,
      company: job.company.name,
      mustHave: analysis.mustHave,
      niceToHave: analysis.niceToHave,
      responsibilities: analysis.responsibilitiesSummary,
      seniority: analysis.seniority,
    },
    candidate: {
      headline: profile.headline ?? "",
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

export const interviewPrepTask: AiTask<InterviewPrepInput, InterviewPrepOutput> = {
  id: "interviewPrep",
  promptVersion: 1,
  schema: InterviewPrepOutputSchema,
  cacheTtlMs: 30 * 86_400_000,
  redactInput: true,
  priority: "user",
  buildMessages: ({ job, candidate }) => [
    {
      role: "system",
      content: [
        "You help a software developer prepare for a job interview.",
        UNTRUSTED_DATA_RULE,
        NO_INVENTION_RULE,
        "technical: likely technical questions for this job's requirements. behavioral: likely behavioral questions. talkingPoints: for each of the candidate's projects (use the exact project name), short points connecting facts from that project to the job; only facts in the project data. brushUp: job requirements the candidate's skills do not cover. askThem: thoughtful questions for the interviewer about this role and team.",
      ].join("\n"),
    },
    {
      role: "user",
      content: `<job_description>${JSON.stringify(job)}</job_description>\n<candidate>${JSON.stringify(candidate)}</candidate>`,
    },
  ],
};

/** Keeps talking points only for the candidate's real projects (no invented ones). */
export function checkInterviewPrep(
  output: InterviewPrepOutput,
  picked: readonly Pick<Project, "name">[],
  now: Date,
): InterviewPrep {
  const names = new Map(picked.map((p) => [p.name.trim().toLowerCase(), p.name]));
  return {
    technical: output.technical,
    behavioral: output.behavioral,
    talkingPoints: output.talkingPoints
      .map((t) => ({ project: names.get(t.project.trim().toLowerCase()) ?? "", points: t.points }))
      .filter((t) => t.project !== "" && t.points.length > 0),
    brushUp: output.brushUp,
    askThem: output.askThem,
    generatedAt: now.toISOString().replace(/\.\d{3}Z$/, "Z"),
  };
}
