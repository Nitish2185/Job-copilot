/** Repeating background work (spec 9.4). Alarms survive service-worker restarts. */
import { browser } from "wxt/browser";

export const ALARMS = {
  feedSync: "feed-sync",
  boardsSync: "boards-sync",
} as const;
export type AlarmName = (typeof ALARMS)[keyof typeof ALARMS];

const SIX_HOURS = 6 * 60;

const SCHEDULE: Record<AlarmName, { periodInMinutes: number; delayInMinutes: number }> = {
  [ALARMS.feedSync]: { periodInMinutes: SIX_HOURS, delayInMinutes: 1 },
  [ALARMS.boardsSync]: { periodInMinutes: SIX_HOURS, delayInMinutes: 5 },
};

/** Creates missing alarms; existing ones keep their timing. */
export async function scheduleAlarms(): Promise<void> {
  for (const [name, timing] of Object.entries(SCHEDULE)) {
    if (!(await browser.alarms.get(name))) await browser.alarms.create(name, timing);
  }
}
