import type { Job } from "@job-copilot/shared";
import { afterEach, describe, expect, it } from "vitest";
import { browser } from "wxt/browser";
import { getDb } from "@/lib/db/db";
import { emptyProfile } from "@/lib/profile/profile";
import { QUEUE_ALARM, enqueue } from "@/lib/queue/runner";
import { updateSettings } from "@/lib/settings/settings";

const job = (id: string, applyUrl: string): Job => ({
  id,
  platform: "lever",
  source: "feed",
  company: { name: "Acme" },
  title: "Engineer",
  locations: [],
  remote: "remote",
  countryCodes: [],
  url: applyUrl,
  applyUrl,
  firstSeenAt: "2026-11-01T00:00:00Z",
  skills: [],
  snippet: "",
  mode: "auto",
  dedupeKey: `acme|engineer|${id}`,
  status: "new",
});

afterEach(async () => {
  const db = getDb();
  await Promise.all([
    db.jobs.clear(),
    db.queue.clear(),
    db.applications.clear(),
    db.profile.clear(),
  ]);
});

async function seed() {
  const now = new Date();
  await getDb().profile.put({
    ...emptyProfile(now),
    basics: {
      ...emptyProfile(now).basics,
      fullName: "Aarav",
      email: "a@example.com",
      phone: "+91 1",
    },
    baseResume: {
      fileName: "r.pdf",
      mimeType: "application/pdf",
      fileId: "f",
      extractedText: "",
      uploadedAt: now.toISOString().replace(/\.\d{3}Z$/, "Z"),
    },
  });
  await getDb().jobs.bulkPut([
    job("1", "https://jobs.lever.co/acme/1/apply"),
    job("2", "https://www.naukri.com/job-listings-2"),
  ]);
}

describe("enqueue", () => {
  it("refuses everything while auto-apply is off", async () => {
    await seed();
    const result = await enqueue(["1"]);
    expect(result.queued).toBe(0);
    expect(result.skipped[0]?.reason).toContain("Auto-apply is off.");
  });

  it("queues Auto-site jobs once, skips others with a reason, and sets the alarm", async () => {
    await seed();
    await updateSettings({ autoApply: { enabled: true, explanationAccepted: true } });
    const result = await enqueue(["1", "2", "missing"]);
    expect(result.queued).toBe(1);
    expect(result.skipped.map((s) => s.jobId)).toEqual(["2", "missing"]);
    const [item] = await getDb().queue.toArray();
    expect(item).toMatchObject({
      jobId: "1",
      state: "pending",
      attempts: 0,
      resumeChoice: "current",
    });
    expect((await getDb().applications.get(item?.applicationId ?? ""))?.status).toBe("queued");
    expect((await getDb().jobs.get("1"))?.status).toBe("queued");
    expect(await browser.alarms.get(QUEUE_ALARM)).toBeDefined();

    const again = await enqueue(["1"]);
    expect(again.skipped[0]?.reason).toContain("already applied");
  });
});
