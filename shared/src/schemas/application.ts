import { z } from "zod";
import { AnswerValueSchema } from "./answers";
import { IsoDateTimeSchema } from "./common";
import { ApplyModeSchema } from "./job";

export const ApplicationStatusSchema = z.enum([
  "queued",
  "in_progress",
  "needs_you",
  "submitted",
  "unconfirmed",
  "failed",
  "withdrawn",
]);
export type ApplicationStatus = z.infer<typeof ApplicationStatusSchema>;

export const APPLICATION_STAGES = [
  "applied",
  "screening",
  "interview",
  "offer",
  "rejected",
  "ghosted",
  "accepted",
] as const;
export const ApplicationStageSchema = z.enum(APPLICATION_STAGES);
export type ApplicationStage = z.infer<typeof ApplicationStageSchema>;

export const NeedsYouReasonSchema = z.enum([
  "captcha",
  "verification_code",
  "unknown_required_question",
  "missing_sensitive_answer",
  "validation_error",
  "login_required",
  "consent_required",
  "approval_required",
  "other",
]);
export type NeedsYouReason = z.infer<typeof NeedsYouReasonSchema>;

export const AnswerSourceSchema = z.enum(["profile", "answer_bank", "ai", "user"]);
export type AnswerSource = z.infer<typeof AnswerSourceSchema>;

export const ApplicationEventSchema = z.object({
  at: IsoDateTimeSchema,
  type: z.string().min(1),
  detail: z.string().optional(),
});
export type ApplicationEvent = z.infer<typeof ApplicationEventSchema>;

export const ContactSchema = z.object({
  name: z.string().min(1),
  email: z.string().optional(),
  role: z.string().optional(),
});
export type Contact = z.infer<typeof ContactSchema>;

export const ApplicationSchema = z.object({
  id: z.string().min(1),
  jobId: z.string().min(1),
  mode: ApplyModeSchema,
  status: ApplicationStatusSchema,
  stage: ApplicationStageSchema,
  resumeChoice: z.enum(["current", "tailored"]),
  resumeVersionId: z.string().optional(),
  coverLetterId: z.string().optional(),
  answersSent: z.array(
    z.object({
      question: z.string(),
      answer: AnswerValueSchema,
      source: AnswerSourceSchema,
    }),
  ),
  needsYouReason: NeedsYouReasonSchema.optional(),
  needsYouDetail: z.string().optional(),
  submittedAt: IsoDateTimeSchema.optional(),
  confirmationText: z.string().optional(),
  notes: z.string(),
  followUpAt: IsoDateTimeSchema.optional(),
  /** Tracker extras (spec 19.1). */
  interviewDates: z.array(IsoDateTimeSchema).optional(),
  contacts: z.array(ContactSchema).optional(),
  /** True when this run stopped before submitting because dry run was on. */
  dryRun: z.boolean().optional(),
  /** Questions the user still has to answer before this application can continue. */
  pendingQuestions: z
    .array(z.object({ question: z.string(), key: z.string(), note: z.string().optional() }))
    .optional(),
  events: z.array(ApplicationEventSchema),
});
export type Application = z.infer<typeof ApplicationSchema>;

export const QueueStateSchema = z.enum([
  "pending",
  "preparing",
  "running",
  "waiting_pause",
  "done",
  "needs_you",
  "failed",
]);
export type QueueState = z.infer<typeof QueueStateSchema>;

export const QueueItemSchema = z.object({
  id: z.string().min(1),
  jobId: z.string().min(1),
  applicationId: z.string().min(1),
  state: QueueStateSchema,
  attempts: z.number().int().nonnegative(),
  lastError: z.string().optional(),
  scheduledFor: IsoDateTimeSchema,
  tabId: z.number().int().optional(),
  /** The user approved this item in the Review queue. */
  approved: z.boolean().optional(),
  resumeChoice: z.enum(["current", "tailored"]).optional(),
  /** When the current step started (a stuck step is retried after a restart). */
  startedAt: IsoDateTimeSchema.optional(),
});
export type QueueItem = z.infer<typeof QueueItemSchema>;
