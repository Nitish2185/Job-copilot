/** extractProfile (spec 11.7 #1): redacted resume text -> profile draft + uncertain fields. */
import { z } from "zod";
import { CACHE_TTL } from "../cache";
import { NO_INVENTION_RULE, UNTRUSTED_DATA_RULE, clip } from "../prompts/common";
import type { AiTask } from "../runner";

const YearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const Year = z.number().int().min(1950).max(2100);

export const ProfileDraftSchema = z.object({
  headline: z.string().max(140).optional(),
  summary: z.string().max(1500),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  skills: z.array(
    z.object({
      name: z.string().min(1),
      years: z.number().min(0).max(60).optional(),
      level: z.enum(["beginner", "intermediate", "advanced", "expert"]).optional(),
    }),
  ),
  experience: z.array(
    z.object({
      company: z.string().min(1),
      title: z.string().min(1),
      location: z.string().optional(),
      employmentType: z.string().optional(),
      startDate: YearMonth,
      endDate: YearMonth.nullable(),
      bullets: z.array(z.string()),
    }),
  ),
  education: z.array(
    z.object({
      institution: z.string().min(1),
      degree: z.string().min(1),
      field: z.string().optional(),
      startYear: Year.optional(),
      endYear: Year.optional(),
      grade: z.string().optional(),
    }),
  ),
  projects: z.array(
    z.object({
      name: z.string().min(1),
      description: z.string(),
      bullets: z.array(z.string()),
      techStack: z.array(z.string()),
      repoUrl: z.string().optional(),
      liveUrl: z.string().optional(),
    }),
  ),
  certifications: z.array(
    z.object({ name: z.string().min(1), issuer: z.string().optional(), year: Year.optional() }),
  ),
  languages: z.array(z.object({ name: z.string().min(1), proficiency: z.string().optional() })),
  achievements: z.array(z.string()),
  /** JSON paths the model was unsure about, e.g. "experience[1].startDate". */
  uncertainFields: z.array(z.string()),
});
export type ProfileDraft = z.infer<typeof ProfileDraftSchema>;

const MAX_RESUME_CHARS = 12_000;

export const extractProfileTask: AiTask<{ resumeText: string }, ProfileDraft> = {
  id: "extractProfile",
  promptVersion: 1,
  schema: ProfileDraftSchema,
  cacheTtlMs: CACHE_TTL.extractProfile,
  redactInput: true,
  priority: "user",
  buildMessages: ({ resumeText }) => [
    {
      role: "system",
      content: [
        "You turn a resume into structured profile data.",
        UNTRUSTED_DATA_RULE,
        NO_INVENTION_RULE,
        "Copy bullets as written (fix only obvious line-break splits). Dates use YYYY-MM; if only a year is known use YYYY-01 and list the field in uncertainFields. A current role has endDate null.",
        "Contact details were replaced with placeholders like [NAME] or [EMAIL]; leave them out.",
        "List any field you are unsure about in uncertainFields as a JSON path.",
      ].join("\n"),
    },
    { role: "user", content: `<resume>\n${clip(resumeText, MAX_RESUME_CHARS)}\n</resume>` },
  ],
};
