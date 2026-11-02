/**
 * answerQuestion (spec 11.7 #8): one non-sensitive application question ->
 * a short answer from the profile. Code blocks sensitive categories before this
 * runs and decides whether the answer is used (confidence, options, length).
 */
import type { JdAnalysis, Profile } from "@job-copilot/shared";
import { z } from "zod";
import { CACHE_TTL } from "../cache";
import { NO_INVENTION_RULE, UNTRUSTED_DATA_RULE, clip } from "../prompts/common";
import type { AiTask } from "../runner";

/** Answers below this confidence are not used (spec 16.3 step 5). */
export const MIN_CONFIDENCE = 0.75;

export const AnswerOutputSchema = z.object({
  answer: z.string().max(4000),
  confidence: z.number().min(0).max(1),
  basis: z.enum(["profile", "inference"]),
  needsUser: z.boolean(),
});
export type AnswerOutput = z.infer<typeof AnswerOutputSchema>;

export interface AnswerQuestionInput {
  question: string;
  fieldType: string;
  options: string[];
  maxLength?: number;
  candidate: {
    headline: string;
    summary: string;
    totalYears: number;
    skills: string[];
    experience: { title: string; company: string; bullets: string[] }[];
    projects: { name: string; description: string }[];
  };
  job?: { mustHave: string[]; responsibilities: string };
}

export function candidateForAnswers(profile: Profile): AnswerQuestionInput["candidate"] {
  return {
    headline: profile.headline ?? "",
    summary: profile.summary,
    totalYears: Math.round((profile.totalExperienceMonths / 12) * 10) / 10,
    skills: profile.skills.map((s) => s.displayName),
    experience: profile.experience.slice(0, 4).map((e) => ({
      title: e.title,
      company: e.company,
      bullets: e.bullets.slice(0, 4),
    })),
    projects: profile.projects
      .filter((p) => p.included)
      .slice(0, 4)
      .map((p) => ({ name: p.name, description: clip(p.description, 400) })),
  };
}

export function jobForAnswers(analysis: JdAnalysis | undefined): AnswerQuestionInput["job"] {
  return analysis
    ? { mustHave: analysis.mustHave, responsibilities: analysis.responsibilitiesSummary }
    : undefined;
}

/** Code decides (spec 16.3): enough confidence, an exact option, and within the length limit. */
export function acceptAnswer(
  output: AnswerOutput,
  options: readonly string[],
  maxLength?: number,
): string | undefined {
  if (output.needsUser || output.confidence < MIN_CONFIDENCE) return undefined;
  const answer = output.answer.trim();
  if (answer === "") return undefined;
  if (options.length > 0) return options.find((o) => o === answer);
  if (maxLength !== undefined && answer.length > maxLength) return undefined;
  return answer;
}

export const answerQuestionTask: AiTask<AnswerQuestionInput, AnswerOutput> = {
  id: "answerQuestion",
  promptVersion: 1,
  schema: AnswerOutputSchema,
  cacheTtlMs: CACHE_TTL.answerQuestion,
  redactInput: true,
  priority: "user",
  buildMessages: ({ question, fieldType, options, maxLength, candidate, job }) => [
    {
      role: "system",
      content: [
        "You answer one job application question for the candidate, in the first person.",
        UNTRUSTED_DATA_RULE,
        NO_INVENTION_RULE,
        "If options are given, answer with exactly one option, copied character for character. Keep free-text answers short and factual.",
        "confidence: how sure you are that the answer is true for this candidate (0-1). basis: profile when the answer is stated in the candidate data, inference otherwise. needsUser: true when only the candidate can answer (personal preferences, facts not in the data).",
      ].join("\n"),
    },
    {
      role: "user",
      content: `<page_content>${JSON.stringify({ question, fieldType, options, maxLength })}</page_content>\n<candidate>${JSON.stringify(candidate)}</candidate>${job ? `\n<job_description>${JSON.stringify(job)}</job_description>` : ""}`,
    },
  ],
};
