import { z } from "zod";
import { CountryCodeSchema, IsoDateTimeSchema } from "./common";
import { CompanyFetchStatusSchema, FeedPlatformSchema } from "./feed";

/** A personal company board the user added in the extension. */
export const CompanySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  platform: FeedPlatformSchema,
  token: z.string().min(1),
  /** Lever EU boards use api.eu.lever.co. */
  variant: z.literal("eu").optional(),
  region: z.array(CountryCodeSchema.or(z.literal("REMOTE"))).optional(),
  addedAt: IsoDateTimeSchema,
  lastFetchedAt: IsoDateTimeSchema.optional(),
  lastStatus: CompanyFetchStatusSchema.optional(),
  enabled: z.boolean(),
});
export type Company = z.infer<typeof CompanySchema>;

/** One entry in `crawler/companies.json` (the shared seed list). */
export const SeedCompanySchema = z.object({
  name: z.string().min(1),
  platform: FeedPlatformSchema,
  token: z.string().min(1),
  variant: z.literal("eu").optional(),
  region: z.array(CountryCodeSchema.or(z.literal("REMOTE"))),
  tags: z.array(z.string()).optional(),
});
export type SeedCompany = z.infer<typeof SeedCompanySchema>;
