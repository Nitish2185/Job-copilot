import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { newAnswer } from "@/lib/answers/answerBank";
import { getDb } from "@/lib/db/db";
import {
  CHUNK_BYTES,
  chunkText,
  loadMirrorMeta,
  pullAnswerMirror,
  pushAnswerMirror,
} from "@/lib/sync/answerMirror";

const now = new Date("2026-11-03T12:00:00Z");

async function answer(question: string, value: string, sensitive = false) {
  return newAnswer({ question, answer: value, fieldType: "text", sensitive }, now);
}

beforeEach(() => {
  fakeBrowser.reset();
});

afterEach(async () => {
  await getDb().answerBank.clear();
});

describe("chunkText", () => {
  it("keeps every stored piece under the item limit, escapes counted", () => {
    const text = JSON.stringify(
      Array.from({ length: 400 }, (_, i) => `"quoted" answer ${String(i)} é`),
    );
    const chunks = chunkText(text);
    expect(chunks.join("")).toBe(text);
    for (const c of chunks) {
      expect(new TextEncoder().encode(JSON.stringify(c)).length).toBeLessThanOrEqual(CHUNK_BYTES);
    }
    expect(chunks.length).toBeGreaterThan(1);
  });
});

describe("answer mirror", () => {
  it("syncs active, non-sensitive answers to another device", async () => {
    const db = getDb();
    await db.answerBank.bulkPut([
      await answer("Why do you want to join us?", "I like the product."),
      await answer("Expected CTC", "18 LPA", true),
      { ...(await answer("Years of Kafka", "3")), status: "pending_approval" },
    ]);
    const meta = await pushAnswerMirror(db, now);
    expect(meta).toMatchObject({ count: 1, chunks: 1 });
    const synced = JSON.stringify(await browser.storage.sync.get(null));
    expect(synced).not.toContain("18 LPA");
    expect(synced).not.toContain("Kafka");

    // Another device: an empty answer bank with the same sync storage.
    await db.answerBank.clear();
    await db.answerBank.put(await answer("Why do you want to join us?", "Local answer"));
    expect(await pullAnswerMirror(db, now)).toBe(0);
    await db.answerBank.clear();
    expect(await pullAnswerMirror(db, now)).toBe(1);
    const [restored] = await db.answerBank.toArray();
    expect(restored).toMatchObject({
      question: "Why do you want to join us?",
      answer: "I like the product.",
      status: "active",
      sensitive: false,
    });
  });

  it("writes only when the answers changed, and removes chunks no longer needed", async () => {
    const db = getDb();
    await db.answerBank.bulkPut(
      await Promise.all(
        Array.from({ length: 60 }, (_, i) => answer(`Question ${String(i)}`, "x".repeat(200))),
      ),
    );
    const first = await pushAnswerMirror(db, now);
    expect(first.chunks).toBeGreaterThan(1);
    expect(await pushAnswerMirror(db, new Date())).toEqual(first);
    await db.answerBank.clear();
    await db.answerBank.put(await answer("Only one", "y"));
    const second = await pushAnswerMirror(db, now);
    expect(second.chunks).toBe(1);
    const keys = Object.keys(await browser.storage.sync.get(null));
    expect(keys.filter((k) => k.startsWith("answerMirror:"))).toEqual(["answerMirror:0"]);
  });

  it("does not sync when it would not fit, and says so", async () => {
    const db = getDb();
    await db.answerBank.bulkPut(
      await Promise.all(
        Array.from({ length: 120 }, (_, i) => answer(`Question ${String(i)}`, "z".repeat(900))),
      ),
    );
    const meta = await pushAnswerMirror(db, now);
    expect(meta).toMatchObject({ tooLarge: true, chunks: 0, count: 120 });
    expect((await loadMirrorMeta())?.tooLarge).toBe(true);
    await db.answerBank.clear();
    expect(await pullAnswerMirror(db, now)).toBe(0);
  });
});
