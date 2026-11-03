/** Repeating background work (spec 9.4). Alarms survive service-worker restarts. */
import { browser } from "wxt/browser";

export const ALARMS = {
  feedSync: "feed-sync",
  boardsSync: "boards-sync",
  /** Hourly: the daily digest (at the chosen hour) and follow-up reminders. */
  notifications: "notifications",
  /** Daily: prune old closed jobs and expired AI cache entries. */
  maintenance: "maintenance",
} as const;
export type AlarmName = (typeof ALARMS)[keyof typeof ALARMS];

const SIX_HOURS = 6 * 60;

const SCHEDULE: Record<AlarmName, { periodInMinutes: number; delayInMinutes: number }> = {
  [ALARMS.feedSync]: { periodInMinutes: SIX_HOURS, delayInMinutes: 1 },
  [ALARMS.boardsSync]: { periodInMinutes: SIX_HOURS, delayInMinutes: 5 },
  [ALARMS.notifications]: { periodInMinutes: 60, delayInMinutes: 2 },
  [ALARMS.maintenance]: { periodInMinutes: 24 * 60, delayInMinutes: 10 },
};

/** Creates missing alarms; existing ones keep their timing. */
export async function scheduleAlarms(): Promise<void> {
  for (const [name, timing] of Object.entries(SCHEDULE)) {
    if (!(await browser.alarms.get(name))) await browser.alarms.create(name, timing);
  }
}
