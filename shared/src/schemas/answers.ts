import { z } from "zod";
import { IsoDateTimeSchema } from "./common";

export const FieldTypeSchema = z.enum([
  "text",
  "textarea",
  "select",
  "radio",
  "checkbox",
  "number",
  "date",
]);
export type FieldType = z.infer<typeof FieldTypeSchema>;

export const AnswerValueSchema = z.union([
  z.string(),
  z.array(z.string()),
  z.number(),
  z.boolean(),
]);
export type AnswerValue = z.infer<typeof AnswerValueSchema>;

/** `global` or `company:<company key>`. */
export const AnswerScopeSchema = z.union([
  z.literal("global"),
  z.string().regex(/^company:.+$/) as z.ZodType<`company:${string}`>,
]);

export const AnswerBankEntrySchema = z.object({
  id: z.string().min(1),
  /** The question exactly as it appeared. */
  question: z.string().min(1),
  /** Lowercase, punctuation stripped, whitespace collapsed. */
  normalized: z.string(),
  fingerprint: z.string().min(1),
  answer: AnswerValueSchema,
  fieldType: FieldTypeSchema,
  options: z.array(z.string()).optional(),
  scope: AnswerScopeSchema,
  source: z.enum(["user", "ai_approved"]),
  /** AI answers wait for approval before they are reused. */
  status: z.enum(["active", "pending_approval"]),
  sensitive: z.boolean(),
  timesUsed: z.number().int().nonnegative(),
  lastUsedAt: IsoDateTimeSchema.optional(),
  createdAt: IsoDateTimeSchema,
});
export type AnswerBankEntry = z.infer<typeof AnswerBankEntrySchema>;
