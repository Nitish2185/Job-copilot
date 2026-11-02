import { z } from "zod";
import { IsoDateTimeSchema } from "./common";

/** Structured resume content; the PDF is rendered from this. */
export const ResumeDocumentSchema = z.object({
  basics: z.object({
    fullName: z.string(),
    headline: z.string().optional(),
    email: z.string(),
    phone: z.string(),
    location: z.string(),
    links: z.array(z.object({ label: z.string(), url: z.string() })),
  }),
  summary: z.string(),
  skills: z.array(z.object({ id: z.string(), displayName: z.string() })),
  experience: z.array(
    z.object({
      experienceId: z.string(),
      company: z.string(),
      title: z.string(),
      location: z.string().optional(),
      startDate: z.string(),
      endDate: z.string().nullable(),
      bullets: z.array(z.string()),
    }),
  ),
  projects: z.array(
    z.object({
      projectId: z.string(),
      name: z.string(),
      description: z.string(),
      bullets: z.array(z.string()),
      techStack: z.array(z.string()),
      link: z.string().optional(),
    }),
  ),
  education: z.array(
    z.object({
      institution: z.string(),
      degree: z.string(),
      field: z.string().optional(),
      startYear: z.number().optional(),
      endYear: z.number().optional(),
      grade: z.string().optional(),
    }),
  ),
  certifications: z.array(
    z.object({ name: z.string(), issuer: z.string().optional(), year: z.number().optional() }),
  ),
  achievements: z.array(z.string()),
});
export type ResumeDocument = z.infer<typeof ResumeDocumentSchema>;

export const ValidationResultSchema = z.object({
  passed: z.boolean(),
  issues: z.array(z.string()),
});
export type ValidationResult = z.infer<typeof ValidationResultSchema>;

export const ResumeVersionSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["base_uploaded", "base_generated", "tailored"]),
  jobId: z.string().optional(),
  createdAt: IsoDateTimeSchema,
  /** Absent for an uploaded base resume, which is kept as the original file. */
  document: ResumeDocumentSchema.optional(),
  /** PDF (or original upload) in the files table. */
  fileId: z.string().min(1),
  pickedProjectIds: z.array(z.string()),
  keywordsTargeted: z.array(z.string()),
  validation: ValidationResultSchema,
  template: z.string().min(1),
  approvedByUser: z.boolean(),
});
export type ResumeVersion = z.infer<typeof ResumeVersionSchema>;

export const CoverLetterSchema = z.object({
  id: z.string().min(1),
  jobId: z.string().min(1),
  text: z.string(),
  fileId: z.string().optional(),
  createdAt: IsoDateTimeSchema,
  validation: ValidationResultSchema,
});
export type CoverLetter = z.infer<typeof CoverLetterSchema>;

export const StoredFileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  mimeType: z.string().min(1),
  blob: z.instanceof(Blob),
  createdAt: IsoDateTimeSchema,
});
export type StoredFile = z.infer<typeof StoredFileSchema>;
