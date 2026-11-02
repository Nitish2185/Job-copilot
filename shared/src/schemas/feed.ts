/**
 * The shared feed contract (spec section 8). The Go crawler mirrors these shapes
 * exactly in `crawler/internal/feed`. Any change must bump FEED_SCHEMA_VERSION.
 */
import { z } from "zod";
import { isAutoSubmitUrl } from "../hosts";
import {
  CountryCodeSchema,
  HttpUrlSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  RemoteSchema,
  SalarySchema,
  Sha256Schema,
  SkillIdSchema,
} from "./common";

export const FEED_PLATFORMS = [
  "greenhouse",
  "lever",
  "ashby",
  "smartrecruiters",
  "workable",
] as const;
export const FeedPlatformSchema = z.enum(FEED_PLATFORMS);
export type FeedPlatform = z.infer<typeof FeedPlatformSchema>;

export const FeedJobSchema = z.object({
  /** `${platform}:${companyToken}:${externalId}` */
  id: z.string().regex(/^(greenhouse|lever|ashby|smartrecruiters|workable):[^:\s]+:\S+$/),
  platform: FeedPlatformSchema,
  company: z.object({
    name: z.string().min(1),
    token: z.string().min(1),
  }),
  title: z.string().min(1),
  locations: z.array(z.string()),
  remote: RemoteSchema,
  countryCodes: z.array(CountryCodeSchema),
  /** Public job page. */
  url: HttpUrlSchema,
  /** Hosted application form; always on an AUTO_SUBMIT_HOSTS host. */
  applyUrl: HttpUrlSchema.refine(isAutoSubmitUrl, "applyUrl must be on an auto-submit host"),
  postedAt: IsoDateTimeSchema.optional(),
  firstSeenAt: IsoDateTimeSchema,
  skills: z.array(SkillIdSchema),
  expMin: z.number().min(0).max(50).optional(),
  expMax: z.number().min(0).max(50).optional(),
  salary: SalarySchema.optional(),
  employmentType: z.string().optional(),
  department: z.string().optional(),
  snippet: z.string().max(300),
  descHash: Sha256Schema,
});
export type FeedJob = z.infer<typeof FeedJobSchema>;

/** `snapshot.json`: every currently open job. */
export const FeedSnapshotSchema = z.object({
  schemaVersion: z.number().int().positive(),
  generatedAt: IsoDateTimeSchema,
  jobs: z.array(FeedJobSchema),
});
export type FeedSnapshot = z.infer<typeof FeedSnapshotSchema>;

/** `jobs/YYYY-MM-DD.json`: jobs first seen that UTC day. */
export const FeedShardSchema = z.object({
  date: IsoDateSchema,
  jobs: z.array(FeedJobSchema),
});
export type FeedShard = z.infer<typeof FeedShardSchema>;

/** `closed/YYYY-MM-DD.json`: IDs of jobs that closed that UTC day. */
export const FeedClosedShardSchema = z.object({
  date: IsoDateSchema,
  ids: z.array(z.string().min(1)),
});
export type FeedClosedShard = z.infer<typeof FeedClosedShardSchema>;

const FeedFilePathSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9/_.-]*\.json$/, "Expected a relative .json path inside the feed")
  .refine((path) => !path.split("/").includes(".."), "Feed paths must not contain '..'");

/**
 * `index.json`. `schemaVersion` accepts any positive integer so the extension can
 * recognise a newer feed and ask the user to update instead of failing to parse.
 */
export const FeedIndexSchema = z.object({
  schemaVersion: z.number().int().positive(),
  generatedAt: IsoDateTimeSchema,
  totalOpenJobs: z.number().int().nonnegative(),
  companyCount: z.number().int().nonnegative(),
  skillsVersion: z.string().min(1),
  snapshot: z.object({
    file: FeedFilePathSchema,
    sha256: Sha256Schema,
    count: z.number().int().nonnegative(),
  }),
  shards: z.array(
    z.object({
      date: IsoDateSchema,
      file: FeedFilePathSchema,
      count: z.number().int().nonnegative(),
      sha256: Sha256Schema,
    }),
  ),
  closedShards: z.array(
    z.object({
      date: IsoDateSchema,
      file: FeedFilePathSchema,
      count: z.number().int().nonnegative(),
    }),
  ),
});
export type FeedIndex = z.infer<typeof FeedIndexSchema>;

export const CompanyFetchStatusSchema = z.enum(["ok", "empty", "not_found", "error"]);
export type CompanyFetchStatus = z.infer<typeof CompanyFetchStatusSchema>;

/** Public `companies.json` used by the website status page and the extension's company list. */
export const FeedCompaniesSchema = z.object({
  generatedAt: IsoDateTimeSchema,
  companies: z.array(
    z.object({
      name: z.string().min(1),
      platform: FeedPlatformSchema,
      token: z.string().min(1),
      jobCount: z.number().int().nonnegative(),
      lastOkAt: IsoDateTimeSchema.optional(),
      lastStatus: CompanyFetchStatusSchema,
    }),
  ),
});
export type FeedCompanies = z.infer<typeof FeedCompaniesSchema>;
