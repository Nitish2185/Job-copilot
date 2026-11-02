import { describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { ALARMS, scheduleAlarms } from "@/lib/alarms/alarms";

describe("scheduleAlarms", () => {
  it("creates the feed and board syncs every 6 hours, once", async () => {
    await scheduleAlarms();
    await scheduleAlarms();
    const alarms = await fakeBrowser.alarms.getAll();
    expect(alarms.map((a) => a.name).sort()).toEqual([ALARMS.boardsSync, ALARMS.feedSync].sort());
    for (const alarm of alarms) expect(alarm.periodInMinutes).toBe(360);
  });
});
