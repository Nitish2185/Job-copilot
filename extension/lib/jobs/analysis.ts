/**
 * Job analysis for tailoring (spec 14.2 step 1): the AI's `analyzeJd`, cached
 * per job in the jdAnalyses table, or a local analysis from the tagged skills
 * when AI is not set up.
 */
import { skillDisplayName, tagSkills, type JdAnalysis, type Job } from "@job-copilot/shared";
import { clip } from "../ai/prompts/common";
import type { JdAnalysisOutput } from "../ai/tasks/analyzeJd";

export const LOCAL_MODEL = "local";

const iso = (date: Date) => date.toISOString().replace(/\.\d{3}Z$/, "Z");

export function seniorityFromTitle(title: string): JdAnalysisOutput["seniority"] {
  const t = title.toLowerCase();
  if (/\bintern(ship)?\b/.test(t)) return "intern";
  if (/\b(lead|principal|staff|head|architect)\b/.test(t)) return "lead";
  if (/\b(senior|sr\.?)\b/.test(t)) return "senior";
  if (/\b(junior|jr\.?|graduate|entry|associate)\b/.test(t)) return "junior";
  return "unknown";
}

/** The job text used for analysis: the full description when fetched, else the snippet. */
export function jobText(job: Pick<Job, "description" | "snippet">): string {
  return job.description?.text ?? job.snippet;
}

/** An analysis without AI: tagged skills (title skills first) as must-haves and keywords. */
export function localJdAnalysis(job: Job, now: Date): JdAnalysis {
  const inTitle = tagSkills(job.title);
  const ordered = [...new Set([...inTitle, ...job.skills, ...tagSkills(jobText(job))])];
  const names = ordered.map(skillDisplayName);
  return {
    jobId: job.id,
    mustHave: names.slice(0, 10),
    niceToHave: [],
    keywords: names.slice(0, 25),
    seniority: seniorityFromTitle(job.title),
    responsibilitiesSummary: clip(jobText(job), 300),
    createdAt: iso(now),
    model: LOCAL_MODEL,
  };
}

export function analysisFromAi(
  job: Pick<Job, "id">,
  output: JdAnalysisOutput,
  model: string,
  now: Date,
): JdAnalysis {
  return {
    jobId: job.id,
    mustHave: output.mustHave,
    niceToHave: output.niceToHave,
    keywords: output.keywords,
    seniority: output.seniority,
    responsibilitiesSummary: output.responsibilitiesSummary,
    ...(output.domain && { domain: output.domain }),
    createdAt: iso(now),
    model,
  };
}
