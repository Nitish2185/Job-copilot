import { describe, expect, it } from "vitest";
import { JobCopilotDB } from "@/lib/db/db";
import { emptyProfile } from "@/lib/profile/profile";
import {
  defaultPreferences,
  loadPreferences,
  loadProfile,
  saveBaseResume,
  savePreferences,
  saveProfile,
} from "@/lib/profile/store";

let n = 0;
const now = new Date("2026-11-02T06:00:00Z");

describe("profile store", () => {
  it("bumps the version on every save", async () => {
    const db = new JobCopilotDB(`store-${String(++n)}`);
    const first = await saveProfile(db, { ...emptyProfile(now), summary: "a" }, now);
    const second = await saveProfile(db, { ...first, summary: "b" }, now);
    expect([first.version, second.version]).toEqual([1, 2]);
    expect((await loadProfile(db)).summary).toBe("b");
  });

  it("refuses invalid profiles", async () => {
    const db = new JobCopilotDB(`store-${String(++n)}`);
    await expect(
      saveProfile(db, {
        ...emptyProfile(now),
        basics: { ...emptyProfile(now).basics, country: "India" },
      }),
    ).rejects.toThrow();
  });

  it("returns default preferences for the user's country until saved", async () => {
    const db = new JobCopilotDB(`store-${String(++n)}`);
    expect((await loadPreferences(db, "IN")).countries).toEqual(["IN"]);
    await savePreferences(db, { ...defaultPreferences("IN"), noticePeriodDays: 60 });
    expect((await loadPreferences(db)).noticePeriodDays).toBe(60);
  });

  it("stores the base resume file and replaces the old one", async () => {
    const db = new JobCopilotDB(`store-${String(++n)}`);
    const blob = new Blob(["%PDF-1.4"], { type: "application/pdf" });
    const withFirst = await saveBaseResume(
      db,
      { name: "a.pdf", type: "application/pdf", blob },
      "text",
      emptyProfile(now),
      now,
    );
    const withSecond = await saveBaseResume(
      db,
      { name: "b.pdf", type: "application/pdf", blob },
      "text 2",
      withFirst,
      now,
    );
    expect(await db.files.count()).toBe(1);
    expect(withSecond.baseResume).toMatchObject({ fileName: "b.pdf", extractedText: "text 2" });
  });
});
