import { describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { ALARMS, scheduleAlarms } from "@/lib/alarms/alarms";

describe("scheduleAlarms", () => {
  it("creates the feed and board syncs every 6 hours and the hourly notification check, once", async () => {
    await scheduleAlarms();
    await scheduleAlarms();
    const alarms = await fakeBrowser.alarms.getAll();
    expect(alarms.map((a) => a.name).sort()).toEqual(
      [ALARMS.boardsSync, ALARMS.feedSync, ALARMS.notifications].sort(),
    );
    const period = (name: string) => alarms.find((a) => a.name === name)?.periodInMinutes;
    expect(period(ALARMS.feedSync)).toBe(360);
    expect(period(ALARMS.boardsSync)).toBe(360);
    expect(period(ALARMS.notifications)).toBe(60);
  });
});
