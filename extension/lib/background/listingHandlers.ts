/** Listing APIs from the background (spec 13.3): run with the boards sync and on request. */
import { browser } from "wxt/browser";
import { z } from "zod";
import { getDb } from "../db/db";
import type { Handlers } from "../messaging/server";
import { loadProfile } from "../profile/store";
import { loadSecrets, loadSettings } from "../settings/settings";
import { syncListings, type CallLog, type ListingResult } from "../sources/listings";
import { afterJobsChanged } from "./matchHandlers";

const CALLS_KEY = "listingCalls";
const CallLogSchema = z.object({ date: z.string(), adzuna: z.number(), jsearch: z.number() });

export async function runListingSync(): Promise<ListingResult> {
  const db = getDb();
  const [settings, secrets, profile, prefs] = await Promise.all([
    loadSettings(),
    loadSecrets(),
    loadProfile(db),
    db.preferences.get("me"),
  ]);
  const { adzuna, jsearch } = settings.sources;
  if (!adzuna.enabled && !jsearch.enabled) return { calls: 0, added: 0, errors: [] };
  const result = await syncListings(
    {
      db,
      fetch: (input, init) => fetch(input, init),
      now: () => new Date(),
      settings,
      secrets,
      granted: (origin) => browser.permissions.contains({ origins: [origin] }).catch(() => false),
      loadCalls: async (): Promise<CallLog | undefined> => {
        const parsed = CallLogSchema.safeParse(
          (await browser.storage.local.get(CALLS_KEY))[CALLS_KEY],
        );
        return parsed.success ? parsed.data : undefined;
      },
      saveCalls: (log) => browser.storage.local.set({ [CALLS_KEY]: log }),
    },
    {
      roles: prefs?.desiredRoles ?? [],
      city: prefs?.preferredLocations[0]?.split(",")[0]?.trim() ?? profile.basics.city,
    },
  );
  if (result.added > 0) await afterJobsChanged().catch(() => undefined);
  return result;
}

export const listingHandlers: Handlers = {
  "listings/sync": () => runListingSync(),
};
