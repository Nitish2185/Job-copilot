import { z } from "zod";

/** Absolute http(s) URL. Plain `z.url()` would also accept `javascript:` and similar schemes. */
export const HttpUrlSchema = z.url({ protocol: /^https?$/ });

/** UTC timestamp in ISO-8601 form, e.g. `2026-11-02T06:00:00Z`. */
export const IsoDateTimeSchema = z.iso.datetime();

/** Calendar date `YYYY-MM-DD`. */
export const IsoDateSchema = z.iso.date();

/** Month `YYYY-MM`, used for experience start and end dates. */
export const YearMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Expected YYYY-MM");

/** ISO 3166-1 alpha-2 country code, uppercase. */
export const CountryCodeSchema = z.string().regex(/^[A-Z]{2}$/, "Expected an ISO-2 country code");

/** ISO 4217 currency code, uppercase. */
export const CurrencySchema = z.string().regex(/^[A-Z]{3}$/, "Expected an ISO-4217 currency code");

/** Lowercase hex SHA-256 digest. */
export const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/, "Expected a SHA-256 hex digest");

export const RemoteSchema = z.enum(["remote", "hybrid", "onsite", "unknown"]);
export type Remote = z.infer<typeof RemoteSchema>;

export const SalaryPeriodSchema = z.enum(["year", "month", "hour"]);

export const SalarySchema = z.object({
  min: z.number().nonnegative().optional(),
  max: z.number().nonnegative().optional(),
  currency: CurrencySchema,
  period: SalaryPeriodSchema,
});
export type Salary = z.infer<typeof SalarySchema>;

/** Canonical skill ID from `shared/data/skills.json`. */
export const SkillIdSchema = z.string().regex(/^[a-z0-9][a-z0-9.+#-]*$/, "Expected a skill ID");
