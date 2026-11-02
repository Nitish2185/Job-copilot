/** Saving the user's own data: profile, preferences and the base resume file. */
import {
  PreferencesSchema,
  ProfileSchema,
  type Preferences,
  type Profile,
} from "@job-copilot/shared";
import type { JobCopilotDB } from "../db/db";
import { emptyProfile, nextVersion } from "./profile";

export async function loadProfile(db: JobCopilotDB, now = new Date()): Promise<Profile> {
  return (await db.profile.get("me")) ?? emptyProfile(now);
}

/** Validates, bumps the version and saves. Returns the saved profile. */
export async function saveProfile(
  db: JobCopilotDB,
  profile: Profile,
  now = new Date(),
): Promise<Profile> {
  const current = await db.profile.get("me");
  const next = ProfileSchema.parse(
    nextVersion({ ...profile, version: current?.version ?? profile.version }, now),
  );
  await db.profile.put(next);
  return next;
}

export function defaultPreferences(country: string): Preferences {
  return {
    workAuthorization: [],
    needsSponsorship: false,
    noticePeriodDays: 30,
    noticeNegotiable: true,
    salaryDisclosure: "ask_each_time",
    preferredLocations: [],
    remotePreference: "any",
    willingToRelocate: false,
    desiredRoles: [],
    experienceLevel: "mid",
    jobTypes: ["full_time"],
    countries: /^[A-Z]{2}$/.test(country) ? [country] : [],
    excludeTitleKeywords: [],
    hiddenCompanies: [],
  };
}

export async function loadPreferences(db: JobCopilotDB, country = ""): Promise<Preferences> {
  const stored = await db.preferences.get("me");
  if (!stored) return defaultPreferences(country);
  const { id: _id, ...prefs } = stored;
  return prefs;
}

export async function savePreferences(
  db: JobCopilotDB,
  preferences: Preferences,
): Promise<Preferences> {
  const valid = PreferencesSchema.parse(preferences);
  await db.preferences.put({ ...valid, id: "me" });
  return valid;
}

/** Stores the uploaded resume as the base resume and records it on the profile. */
export async function saveBaseResume(
  db: JobCopilotDB,
  file: { name: string; type: string; blob: Blob },
  extractedText: string,
  profile: Profile,
  now = new Date(),
): Promise<Profile> {
  const fileId = crypto.randomUUID();
  const at = now.toISOString().replace(/\.\d{3}Z$/, "Z");
  await db.files.put({
    id: fileId,
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    blob: file.blob,
    createdAt: at,
  });
  if (profile.baseResume) await db.files.delete(profile.baseResume.fileId);
  return {
    ...profile,
    baseResume: {
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      fileId,
      extractedText,
      uploadedAt: at,
    },
  };
}
