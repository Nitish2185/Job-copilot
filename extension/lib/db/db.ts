/**
 * The extension's IndexedDB database (spec 6, "Storage mapping"). Every schema
 * change adds a new version with an upgrade function; never edit a released
 * version, so user data survives updates.
 */
import type {
  AiCacheEntry,
  AnswerBankEntry,
  Application,
  Company,
  CoverLetter,
  JdAnalysis,
  Job,
  JobScore,
  Preferences,
  Profile,
  Project,
  QueueItem,
  ResumeVersion,
  StoredFile,
} from "@job-copilot/shared";
import Dexie, { type EntityTable } from "dexie";

export const DB_NAME = "job-copilot";

/** Sync state of the shared feed (one row, id "feed"). */
export interface FeedState {
  id: "feed";
  /** Feed base URL the state belongs to; changing it starts over with a snapshot. */
  baseUrl: string;
  etag?: string;
  /** generatedAt of the last index that was applied. */
  lastIndexGeneratedAt?: string;
  snapshotGeneratedAt?: string;
  /** Applied daily shards: date -> sha256. */
  appliedShards: Record<string, string>;
  /** Applied closed files: date -> number of IDs. */
  appliedClosed: Record<string, number>;
  lastCheckedAt?: string;
  lastSyncAt?: string;
  status: "never" | "ok" | "error" | "update_required";
  error?: string;
  totalOpenJobs?: number;
  schemaVersion?: number;
}

/** Stored preferences have the fixed key "me". */
export type PreferencesRecord = Preferences & { id: "me" };

/** Free-form activity log (debugging and analytics). */
export interface EventRecord {
  seq?: number;
  at: string;
  type: string;
  detail?: string;
}

/** Version 1 tables and indexes. Do not change: add a new version instead. */
export const SCHEMA_V1 = {
  profile: "id",
  projects: "id, updatedAt",
  preferences: "id",
  answerBank: "id, fingerprint, normalized, scope, status",
  jobs: "id, status, platform, source, firstSeenAt, company.token, dedupeKey, mode, closedAt",
  scores: "jobId, final, profileVersion",
  jdAnalyses: "jobId",
  applications: "id, jobId, stage, status, submittedAt",
  resumeVersions: "id, jobId, kind, createdAt",
  coverLetters: "id, jobId",
  files: "id",
  queue: "id, state, scheduledFor, jobId",
  companies: "id, [platform+token], enabled",
  aiCache: "key, task, expiresAt",
  feedState: "id",
  events: "++seq, at, type",
} as const;

export class JobCopilotDB extends Dexie {
  profile!: EntityTable<Profile, "id">;
  projects!: EntityTable<Project, "id">;
  preferences!: EntityTable<PreferencesRecord, "id">;
  answerBank!: EntityTable<AnswerBankEntry, "id">;
  jobs!: EntityTable<Job, "id">;
  scores!: EntityTable<JobScore, "jobId">;
  jdAnalyses!: EntityTable<JdAnalysis, "jobId">;
  applications!: EntityTable<Application, "id">;
  resumeVersions!: EntityTable<ResumeVersion, "id">;
  coverLetters!: EntityTable<CoverLetter, "id">;
  files!: EntityTable<StoredFile, "id">;
  queue!: EntityTable<QueueItem, "id">;
  companies!: EntityTable<Company, "id">;
  aiCache!: EntityTable<AiCacheEntry, "key">;
  feedState!: EntityTable<FeedState, "id">;
  events!: EntityTable<EventRecord, "seq">;

  constructor(name: string = DB_NAME) {
    super(name);
    this.version(1).stores(SCHEMA_V1);
  }
}

let instance: JobCopilotDB | undefined;

/** The shared database for this extension context. */
export function getDb(): JobCopilotDB {
  instance ??= new JobCopilotDB();
  return instance;
}

/** Forgets the open database (after "Delete everything"), so the next use creates it again. */
export function resetDb(): void {
  instance?.close();
  instance = undefined;
}
