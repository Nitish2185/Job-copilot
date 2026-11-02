/**
 * extractJobFromPage (spec 11.7 #9): the visible text of a job page -> the job.
 * Used only when the page has no structured data and the adapter cannot read it.
 */
import { z } from "zod";
import { CACHE_TTL } from "../cache";
import { NO_INVENTION_RULE, UNTRUSTED_DATA_RULE, clip } from "../prompts/common";
import type { AiTask } from "../runner";

export const PAGE_TEXT_CHARS = 8000;

export const ExtractedJobSchema = z.object({
  isJobPosting: z.boolean(),
  title: z.string().max(200),
  company: z.string().max(200),
  locations: z.array(z.string().max(120)).max(10),
  description: z.string().max(6000),
  applyHints: z.string().max(300).optional(),
});
export type ExtractedJob = z.infer<typeof ExtractedJobSchema>;

export const extractJobFromPageTask: AiTask<{ url: string; text: string }, ExtractedJob> = {
  id: "extractJobFromPage",
  promptVersion: 1,
  schema: ExtractedJobSchema,
  cacheTtlMs: CACHE_TTL.analyzeJd,
  redactInput: true,
  priority: "user",
  buildMessages: ({ url, text }) => [
    {
      role: "system",
      content: [
        "You read the visible text of a web page and extract the job posting on it.",
        UNTRUSTED_DATA_RULE,
        NO_INVENTION_RULE,
        "isJobPosting: false if the page is not one job posting (then leave the other fields empty). description: the job description as plain text. applyHints: how to apply, if stated.",
      ].join("\n"),
    },
    {
      role: "user",
      content: `${JSON.stringify({ url })}\n<page_content>${clip(text, PAGE_TEXT_CHARS)}</page_content>`,
    },
  ],
};
