import { z } from "zod";
import {
  CountryCodeSchema,
  HttpUrlSchema,
  IsoDateTimeSchema,
  RemoteSchema,
  SalarySchema,
  SkillIdSchema,
} from "./common";

export const JOB_PLATFORMS = [
  "greenhouse",
  "lever",
  "ashby",
  "workable",
  "smartrecruiters",
  "naukri",
  "indeed",
  "linkedin",
  "workday",
  "adzuna",
  "jsearch",
  "other",
] as const;
export const JobPlatformSchema = z.enum(JOB_PLATFORMS);
export type JobPlatform = z.infer<typeof JobPlatformSchema>;

export const JobSourceSchema = z.enum([
  "feed",
  "personal_board",
  "aggregator",
  "saved_from_page",
  "pasted",
]);
export type JobSource = z.infer<typeof JobSourceSchema>;

export const ApplyModeSchema = z.enum(["auto", "assist"]);
export type ApplyMode = z.infer<typeof ApplyModeSchema>;

export const JobStatusSchema = z.enum([
  "new",
  "saved",
  "hidden",
  "queued",
  "applied",
  "needs_you",
  "closed",
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const JobSchema = z.object({
  /** `${platform}:${companyToken}:${externalId}` or `manual:${sha256}`. */
  id: z.string().min(1),
  platform: JobPlatformSchema,
  source: JobSourceSchema,
  company: z.object({
    name: z.string().min(1),
    token: z.string().optional(),
    domain: z.string().optional(),
  }),
  title: z.string().min(1),
  locations: z.array(z.string()),
  remote: RemoteSchema,
  countryCodes: z.array(CountryCodeSchema),
  url: HttpUrlSchema.or(z.literal("")),
  applyUrl: HttpUrlSchema.or(z.literal("")),
  /** "Apply on company site" link found on a job board. */
  externalApplyUrl: HttpUrlSchema.optional(),
  /** Other listings merged into this job by de-duplication (spec 13.8). */
  alsoListedOn: z.array(z.object({ platform: JobPlatformSchema, url: HttpUrlSchema })).optional(),
  postedAt: IsoDateTimeSchema.optional(),
  firstSeenAt: IsoDateTimeSchema,
  closedAt: IsoDateTimeSchema.optional(),
  skills: z.array(SkillIdSchema),
  experienceMin: z.number().min(0).max(50).optional(),
  experienceMax: z.number().min(0).max(50).optional(),
  salary: SalarySchema.optional(),
  employmentType: z.string().optional(),
  department: z.string().optional(),
  snippet: z.string().max(300),
  /** Fetched on demand. `html` is always sanitized before it is stored. */
  description: z
    .object({
      html: z.string(),
      text: z.string(),
      fetchedAt: IsoDateTimeSchema,
    })
    .optional(),
  /** Derived from the host of applyUrl / externalApplyUrl. */
  mode: ApplyModeSchema,
  /** normalize(company) | normalize(title) | normalize(primary location) */
  dedupeKey: z.string().min(1),
  status: JobStatusSchema,
  /** Feed description hash, used to notice changed descriptions. */
  descHash: z.string().optional(),
});
export type Job = z.infer<typeof JobSchema>;

const Score100Schema = z.number().int().min(0).max(100);

export const AiScoreSchema = z.object({
  score: Score100Schema,
  verdict: z.enum(["strong", "good", "weak", "no"]),
  mustHave: z.array(z.object({ skill: z.string().min(1), met: z.boolean() })),
  niceToHave: z.array(z.object({ skill: z.string().min(1), met: z.boolean() })),
  experienceFit: z.enum(["under", "fit", "over", "unknown"]),
  locationFit: z.boolean().nullable(),
  salaryFit: z.boolean().nullable(),
  reasons: z.array(z.string().max(140)).max(3),
  redFlags: z.array(z.string()),
});
export type AiScore = z.infer<typeof AiScoreSchema>;

export const PrefilterResultSchema = z.object({
  score: Score100Schema,
  matchedSkills: z.array(SkillIdSchema),
  missingSkills: z.array(SkillIdSchema),
  passed: z.boolean(),
  reasons: z.array(z.string()),
  /** Set when a hard filter from the preferences removes the job (spec 12.1), e.g. "Hidden company". */
  excluded: z.string().optional(),
});
export type PrefilterResult = z.infer<typeof PrefilterResultSchema>;

export const JobScoreSchema = z.object({
  jobId: z.string().min(1),
  profileVersion: z.number().int().nonnegative(),
  prefilter: PrefilterResultSchema,
  ai: AiScoreSchema.optional(),
  final: Score100Schema,
  /** True when `final` comes from the prefilter only. */
  isEstimate: z.boolean(),
  scoredAt: IsoDateTimeSchema,
  model: z.string().optional(),
});
export type JobScore = z.infer<typeof JobScoreSchema>;

export const JdAnalysisSchema = z.object({
  jobId: z.string().min(1),
  mustHave: z.array(z.string()),
  niceToHave: z.array(z.string()),
  keywords: z.array(z.string()),
  seniority: z.string(),
  responsibilitiesSummary: z.string(),
  domain: z.string().optional(),
  createdAt: IsoDateTimeSchema,
  model: z.string(),
});
export type JdAnalysis = z.infer<typeof JdAnalysisSchema>;
