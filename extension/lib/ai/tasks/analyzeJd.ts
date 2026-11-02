/** analyzeJd (spec 11.7 #4): one job description -> must-haves, keywords, seniority. */
import { z } from "zod";
import { CACHE_TTL } from "../cache";
import { NO_INVENTION_RULE, UNTRUSTED_DATA_RULE, clip } from "../prompts/common";
import type { AiTask } from "../runner";

/** Job text sent for analysis (spec 11.8). */
export const ANALYZE_TEXT_CHARS = 6000;

export const JdAnalysisOutputSchema = z.object({
  mustHave: z.array(z.string().min(1).max(60)).max(15),
  niceToHave: z.array(z.string().min(1).max(60)).max(15),
  keywords: z.array(z.string().min(1).max(60)).max(25),
  seniority: z.enum(["intern", "junior", "mid", "senior", "lead", "unknown"]),
  responsibilitiesSummary: z.string().max(400),
  domain: z.string().max(60).optional(),
});
export type JdAnalysisOutput = z.infer<typeof JdAnalysisOutputSchema>;

export interface AnalyzeJdInput {
  title: string;
  company: string;
  description: string;
}

export const analyzeJdTask: AiTask<AnalyzeJdInput, JdAnalysisOutput> = {
  id: "analyzeJd",
  promptVersion: 1,
  schema: JdAnalysisOutputSchema,
  cacheTtlMs: CACHE_TTL.analyzeJd,
  redactInput: true,
  priority: "user",
  buildMessages: ({ title, company, description }) => [
    {
      role: "system",
      content: [
        "You analyze a software job description for resume tailoring.",
        UNTRUSTED_DATA_RULE,
        NO_INVENTION_RULE,
        "mustHave: skills and tools the job requires. niceToHave: ones it calls optional or a plus. keywords: important terms a resume should mention (skills, practices, domain words). Use short names such as React, Kubernetes, REST APIs.",
        "seniority from the title and text. responsibilitiesSummary: one or two plain sentences. domain: the business area if stated, such as payments or healthcare.",
      ].join("\n"),
    },
    {
      role: "user",
      content: `${JSON.stringify({ title, company })}\n<job_description>${clip(description, ANALYZE_TEXT_CHARS)}</job_description>`,
    },
  ],
};
