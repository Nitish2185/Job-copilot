/** Loaders for the golden case files shared with the Go crawler. */
import { z } from "zod";

export function goldenCases<T extends z.ZodType>(caseSchema: T, data: unknown): z.infer<T>[] {
  return z.object({ description: z.string(), cases: z.array(caseSchema).min(1) }).parse(data).cases;
}
