import { z } from "zod";
import { CountryCodeSchema, CurrencySchema, IsoDateSchema } from "./common";

export const WorkAuthorizationStatusSchema = z.enum([
  "citizen",
  "permanent_resident",
  "work_visa",
  "needs_sponsorship",
  "other",
]);

export const PayPeriodSchema = z.enum(["year", "month"]);

export const ExperienceLevelSchema = z.enum(["intern", "junior", "mid", "senior", "lead"]);
export type ExperienceLevel = z.infer<typeof ExperienceLevelSchema>;

export const JobTypeSchema = z.enum(["full_time", "contract", "internship", "part_time"]);
export type JobType = z.infer<typeof JobTypeSchema>;

export const RemotePreferenceSchema = z.enum(["remote", "hybrid", "onsite", "any"]);

/** Voluntary diversity answers. Missing values mean "decline to self-identify". */
export const EeoSchema = z.object({
  gender: z.string().optional(),
  raceEthnicity: z.string().optional(),
  hispanicLatino: z.string().optional(),
  veteranStatus: z.string().optional(),
  disabilityStatus: z.string().optional(),
  pronouns: z.string().optional(),
});

/** The "ask once" answers (spec section 6). */
export const PreferencesSchema = z.object({
  workAuthorization: z.array(
    z.object({
      countryCode: CountryCodeSchema,
      status: WorkAuthorizationStatusSchema,
      note: z.string().optional(),
    }),
  ),
  needsSponsorship: z.boolean(),
  noticePeriodDays: z.number().int().min(0).max(365),
  noticeNegotiable: z.boolean(),
  servingNotice: z.object({ lastWorkingDay: IsoDateSchema.optional() }).optional(),
  currentCtc: z
    .object({
      amount: z.number().nonnegative(),
      currency: CurrencySchema,
      period: PayPeriodSchema,
    })
    .optional(),
  expectedCtc: z
    .object({
      min: z.number().nonnegative(),
      max: z.number().nonnegative().optional(),
      currency: CurrencySchema,
      period: PayPeriodSchema,
    })
    .refine((c) => c.max === undefined || c.max >= c.min, {
      message: "Maximum must not be below minimum",
      path: ["max"],
    })
    .optional(),
  salaryDisclosure: z.enum(["share", "ask_each_time"]),
  preferredLocations: z.array(z.string()),
  remotePreference: RemotePreferenceSchema,
  willingToRelocate: z.boolean(),
  earliestStartDate: IsoDateSchema.optional(),
  desiredRoles: z.array(z.string().min(1)),
  experienceLevel: ExperienceLevelSchema,
  jobTypes: z.array(JobTypeSchema),
  /** ISO-2 codes of countries the user wants jobs in. */
  countries: z.array(CountryCodeSchema),
  excludeTitleKeywords: z.array(z.string().min(1)),
  hiddenCompanies: z.array(z.string().min(1)),
  /** Optional minimum salary filter for job preferences (onboarding step 7). */
  minSalary: z
    .object({
      amount: z.number().nonnegative(),
      currency: CurrencySchema,
      period: PayPeriodSchema,
    })
    .optional(),
  eeo: EeoSchema.optional(),
  /** Only if the user chooses to provide it. */
  dateOfBirth: IsoDateSchema.optional(),
  howDidYouHearDefault: z.string().optional(),
});
export type Preferences = z.infer<typeof PreferencesSchema>;
