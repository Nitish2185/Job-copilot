import { z } from "zod";
import { IsoDateTimeSchema, Sha256Schema } from "./common";

export const AiCacheEntrySchema = z.object({
  /** SHA-256 of taskId + promptVersion + model + canonical JSON input. */
  key: Sha256Schema,
  task: z.string().min(1),
  promptVersion: z.number().int().positive(),
  model: z.string().min(1),
  value: z.unknown(),
  createdAt: IsoDateTimeSchema,
  expiresAt: IsoDateTimeSchema.optional(),
});
export type AiCacheEntry = z.infer<typeof AiCacheEntrySchema>;
