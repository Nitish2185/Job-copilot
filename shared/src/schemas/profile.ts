import { z } from "zod";
import {
  CountryCodeSchema,
  HttpUrlSchema,
  IsoDateTimeSchema,
  SkillIdSchema,
  YearMonthSchema,
} from "./common";

export const SkillLevelSchema = z.enum(["beginner", "intermediate", "advanced", "expert"]);

export const ProfileSkillSchema = z.object({
  id: SkillIdSchema,
  displayName: z.string().min(1),
  years: z.number().min(0).max(60).optional(),
  level: SkillLevelSchema.optional(),
  source: z.enum(["resume", "github", "user"]),
});
export type ProfileSkill = z.infer<typeof ProfileSkillSchema>;

export const ExperienceSchema = z
  .object({
    id: z.string().min(1),
    company: z.string().min(1),
    title: z.string().min(1),
    location: z.string().optional(),
    employmentType: z.string().optional(),
    startDate: YearMonthSchema,
    /** null means the user still works here. */
    endDate: YearMonthSchema.nullable(),
    bullets: z.array(z.string()),
    skills: z.array(SkillIdSchema),
  })
  .refine((e) => e.endDate === null || e.endDate >= e.startDate, {
    message: "End date must not be before start date",
    path: ["endDate"],
  });
export type Experience = z.infer<typeof ExperienceSchema>;

export const EducationSchema = z.object({
  id: z.string().min(1),
  institution: z.string().min(1),
  degree: z.string().min(1),
  field: z.string().optional(),
  startYear: z.number().int().min(1950).max(2100).optional(),
  endYear: z.number().int().min(1950).max(2100).optional(),
  grade: z.string().optional(),
});
export type Education = z.infer<typeof EducationSchema>;

export const CertificationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  issuer: z.string().optional(),
  year: z.number().int().min(1950).max(2100).optional(),
  url: HttpUrlSchema.optional(),
});
export type Certification = z.infer<typeof CertificationSchema>;

export const ProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** 1-3 sentences, confirmed by the user. */
  description: z.string(),
  /** Facts only, confirmed by the user. */
  bullets: z.array(z.string()),
  techStack: z.array(SkillIdSchema),
  links: z.object({
    repo: HttpUrlSchema.optional(),
    live: HttpUrlSchema.optional(),
  }),
  source: z.enum(["github", "resume", "manual"]),
  github: z
    .object({
      fullName: z.string().min(1),
      stars: z.number().int().nonnegative(),
      forks: z.number().int().nonnegative(),
      isFork: z.boolean(),
      archived: z.boolean(),
      languages: z.record(z.string(), z.number().nonnegative()),
      topics: z.array(z.string()),
      readmeExcerpt: z.string().max(2000),
      pushedAt: IsoDateTimeSchema,
    })
    .optional(),
  /** The user ticked "this is a real project". */
  included: z.boolean(),
  /** Always include in tailored resumes. */
  highlight: z.boolean(),
  updatedAt: IsoDateTimeSchema,
});
export type Project = z.infer<typeof ProjectSchema>;

export const ProfileSchema = z.object({
  id: z.literal("me"),
  /** Increments on every edit; scores remember the version they were computed for. */
  version: z.number().int().nonnegative(),
  basics: z.object({
    fullName: z.string(),
    email: z.string(),
    phone: z.string(),
    phoneCountryCode: z.string().optional(),
    city: z.string(),
    state: z.string().optional(),
    country: CountryCodeSchema.or(z.literal("")),
    linkedinUrl: HttpUrlSchema.optional(),
    githubUsername: z.string().optional(),
    portfolioUrl: HttpUrlSchema.optional(),
    otherLinks: z.array(z.object({ label: z.string().min(1), url: HttpUrlSchema })),
  }),
  headline: z.string().optional(),
  summary: z.string(),
  /** Computed from experience; the user can override it. */
  totalExperienceMonths: z.number().int().nonnegative(),
  skills: z.array(ProfileSkillSchema),
  experience: z.array(ExperienceSchema),
  education: z.array(EducationSchema),
  projects: z.array(ProjectSchema),
  certifications: z.array(CertificationSchema),
  languages: z.array(z.object({ name: z.string().min(1), proficiency: z.string().optional() })),
  achievements: z.array(z.string()),
  baseResume: z
    .object({
      fileName: z.string().min(1),
      mimeType: z.string().min(1),
      fileId: z.string().min(1),
      extractedText: z.string(),
      uploadedAt: IsoDateTimeSchema,
    })
    .optional(),
  updatedAt: IsoDateTimeSchema,
});
export type Profile = z.infer<typeof ProfileSchema>;
