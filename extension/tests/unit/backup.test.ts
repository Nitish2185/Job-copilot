import type { Application } from "@job-copilot/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";
import {
  BACKUP_VERSION,
  BackupError,
  backupFileName,
  createBackup,
  importBackup,
  readBackup,
} from "@/lib/backup/backup";
import { pruneClosedJobs } from "@/lib/backup/retention";
import { deleteEverything } from "@/lib/background/dataHandlers";
import { getDb } from "@/lib/db/db";
import { loadSecrets, loadSettings, updateSecrets, updateSettings } from "@/lib/settings/settings";
import { sampleJob } from "./helpers";

const now = new Date("2026-11-03T12:00:00Z");

const app = (id: string, jobId: string): Application => ({
  id,
  jobId,
  mode: "assist",
  status: "submitted",
  stage: "applied",
  resumeChoice: "current",
  answersSent: [],
  notes: "",
  events: [],
});

async function seed() {
  const db = getDb();
  await db.jobs.put(sampleJob({ id: "j1" }));
  await db.applications.put(app("a1", "j1"));
  await db.files.put({
    id: "f1",
    name: "resume.pdf",
    mimeType: "application/pdf",
    blob: new Blob(["%PDF-1.4 hello"], { type: "application/pdf" }),
    createdAt: "2026-11-01T00:00:00Z",
  });
  await db.events.add({ at: "2026-11-01T00:00:00Z", type: "feed_sync" });
  await db.aiCache.put({
    key: "k",
    task: "scoreJobs",
    value: {},
    createdAt: "2026-11-01T00:00:00Z",
  } as never);
}

async function clearDb() {
  const db = getDb();
  await Promise.all(db.tables.map((t) => t.clear()));
}

beforeEach(async () => {
  fakeBrowser.reset();
  await clearDb();
});

afterEach(clearDb);

describe("backup", () => {
  it("round-trips every table and file, without the AI cache or keys", async () => {
    await seed();
    await updateSecrets({ aiKeys: { gemini: "secret-key" } });
    const settings = await updateSettings({ notifications: { followUpDays: 9 } });
    const backup = await createBackup(getDb(), { settings, now });
    const text = JSON.stringify(backup);
    expect(text).not.toContain("secret-key");
    expect(backup.tables.aiCache).toBeUndefined();
    expect(backupFileName(now)).toMatch(/^jobcopilot-backup-2026-11-0\d\.json$/);

    await clearDb();
    const parsed = readBackup(text);
    expect(await importBackup(getDb(), parsed, "replace")).toEqual({ records: 4, skipped: 0 });
    const db = getDb();
    expect(await db.jobs.get("j1")).toBeTruthy();
    expect(await db.applications.get("a1")).toBeTruthy();
    const file = await db.files.get("f1");
    expect(file?.blob.type).toBe("application/pdf");
    expect(await file?.blob.text()).toBe("%PDF-1.4 hello");
  });

  it("includes keys only when asked", async () => {
    await updateSecrets({ aiKeys: { gemini: "secret-key" } });
    const backup = await createBackup(getDb(), {
      settings: await loadSettings(),
      secrets: await loadSecrets(),
    });
    expect(JSON.stringify(backup)).toContain("secret-key");
  });

  it("merges: keeps local records, the backup wins for the same ID, log entries are appended", async () => {
    await seed();
    const backup = await createBackup(getDb(), { settings: await loadSettings() });
    const db = getDb();
    await db.jobs.put(sampleJob({ id: "local" }));
    await db.applications.put({ ...app("a1", "j1"), notes: "changed here" });
    await importBackup(db, backup, "merge");
    expect(await db.jobs.count()).toBe(2);
    expect((await db.applications.get("a1"))?.notes).toBe("");
    expect(await db.events.count()).toBe(2);
  });

  it("replace removes what is not in the backup", async () => {
    await seed();
    const backup = await createBackup(getDb(), { settings: await loadSettings() });
    await getDb().jobs.put(sampleJob({ id: "local" }));
    await importBackup(getDb(), backup, "replace");
    expect(await getDb().jobs.toCollection().primaryKeys()).toEqual(["j1"]);
  });

  it("skips records without their ID", async () => {
    const backup = readBackup(
      JSON.stringify({
        format: "job-copilot-backup",
        version: 1,
        exportedAt: now.toISOString(),
        tables: { jobs: [{ title: "No id" }, sampleJob({ id: "ok" })] },
      }),
    );
    expect(await importBackup(getDb(), backup, "merge")).toEqual({ records: 1, skipped: 1 });
  });

  it("refuses other files and newer backups", () => {
    expect(() => readBackup("not json")).toThrow(BackupError);
    expect(() => readBackup(JSON.stringify({ hello: 1 }))).toThrow("not a Job Copilot backup");
    expect(() =>
      readBackup(
        JSON.stringify({
          format: "job-copilot-backup",
          version: BACKUP_VERSION + 1,
          exportedAt: now.toISOString(),
          tables: {},
        }),
      ),
    ).toThrow("newer version");
  });
});

describe("retention", () => {
  it("removes closed jobs after 60 days unless applied to", async () => {
    const db = getDb();
    await db.jobs.bulkPut([
      sampleJob({ id: "old", status: "closed", closedAt: "2026-08-01T00:00:00Z" }),
      sampleJob({ id: "recent", status: "closed", closedAt: "2026-10-20T00:00:00Z" }),
      sampleJob({ id: "applied", status: "closed", closedAt: "2026-08-01T00:00:00Z" }),
      sampleJob({ id: "open" }),
    ]);
    await db.applications.put(app("a", "applied"));
    expect(await pruneClosedJobs(db, now)).toBe(1);
    expect((await db.jobs.toCollection().primaryKeys()).sort()).toEqual([
      "applied",
      "open",
      "recent",
    ]);
  });
});

describe("delete everything", () => {
  it("clears the database and every storage area, then starts fresh", async () => {
    await seed();
    await updateSecrets({ aiKeys: { gemini: "secret-key" } });
    await browser.storage.local.set({ flags: { installedAt: "x" } });
    await deleteEverything();
    const db = getDb();
    expect(await db.jobs.count()).toBe(0);
    expect(await db.files.count()).toBe(0);
    expect((await loadSecrets()).aiKeys).toEqual({});
    expect(await browser.storage.local.get("flags")).toEqual({});
    expect((await loadSettings()).notifications.followUpDays).toBe(7);
  });
});
