/**
 * followUpEmail (spec 19.2): a short, polite follow-up the user copies and sends
 * themselves. Job Copilot never sends email.
 */
import { z } from "zod";
import { NO_INVENTION_RULE, UNTRUSTED_DATA_RULE } from "../prompts/common";
import type { AiTask } from "../runner";

export const FollowUpEmailSchema = z.object({
  subject: z.string().min(1).max(150),
  body: z.string().min(1).max(1500),
});
export type FollowUpEmail = z.infer<typeof FollowUpEmailSchema>;

export interface FollowUpEmailInput {
  job: { title: string; company: string };
  appliedOn: string;
  candidate: { name: string; headline: string; skills: string[] };
  contactName?: string;
}

export const followUpEmailTask: AiTask<FollowUpEmailInput, FollowUpEmail> = {
  id: "followUpEmail",
  promptVersion: 1,
  schema: FollowUpEmailSchema,
  cacheTtlMs: 7 * 86_400_000,
  // The candidate's name signs the email; nothing else personal is sent.
  redactInput: false,
  priority: "user",
  buildMessages: (input) => [
    {
      role: "system",
      content: [
        "You write a short follow-up email about a job application the candidate already sent.",
        UNTRUSTED_DATA_RULE,
        NO_INVENTION_RULE,
        "80-140 words, plain text, polite and specific: the role, when they applied, continued interest, one or two of the candidate's skills that fit the role, and a request for any update. Greet the contact by name if given, otherwise the hiring team. Sign with the candidate's name. No placeholders in square brackets, no attachments, no claims about interviews or conversations.",
      ].join("\n"),
    },
    { role: "user", content: `<application>${JSON.stringify(input)}</application>` },
  ],
};

/** Refuses drafts that still contain placeholders such as "[Hiring Manager]". */
export function followUpProblems(draft: FollowUpEmail): string[] {
  return /\[[^\]]{2,40}\]/.test(`${draft.subject}\n${draft.body}`)
    ? ["The draft has a placeholder in square brackets. Edit it before sending."]
    : [];
}
