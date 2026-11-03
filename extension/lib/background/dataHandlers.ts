/** "Delete everything" (spec 20): runs here so the background's own database handle is closed too. */
import { browser } from "wxt/browser";
import { scheduleAlarms } from "../alarms/alarms";
import { getDb, resetDb } from "../db/db";
import type { Handlers } from "../messaging/server";
import { ensureSettings } from "../settings/settings";

function storageAreas() {
  const s = browser.storage as unknown as Record<
    string,
    { clear?: () => Promise<void> } | undefined
  >;
  return ["local", "sync", "session"].map((name) => s[name]).filter((a) => a?.clear);
}

export async function deleteEverything(): Promise<void> {
  await getDb().delete();
  resetDb();
  for (const area of storageAreas()) await area?.clear?.();
  // Site permissions (and the LinkedIn/Workday scripts that follow them) are not data:
  // they stay until the user removes them in Settings or the browser.
  await browser.alarms.clearAll();
  // Start again like a fresh install.
  await ensureSettings();
  await scheduleAlarms();
}

export const dataHandlers: Handlers = {
  "data/deleteEverything": async () => {
    await deleteEverything();
    return { deleted: true };
  },
};
