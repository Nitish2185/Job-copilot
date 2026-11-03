/**
 * Answer-bank mirror in chrome.storage.sync (spec 6, 20): a compact copy of the
 * active, non-sensitive answers, split into chunks under the per-item quota, so
 * answers follow the user to other browsers signed in to the same account.
 * Sensitive answers (pay, notice, disability...) and secrets never sync. When
 * the mirror would not fit, it is not written and the user is told to use
 * export/import instead.
 */
import {
  AnswerValueSchema,
  FieldTypeSchema,
  sha256Hex,
  type AnswerBankEntry,
} from "@job-copilot/shared";
import { browser } from "wxt/browser";
import { z } from "zod";
import { newAnswer } from "../answers/answerBank";
import type { JobCopilotDB } from "../db/db";

export const MIRROR_META_KEY = "answerMirror";
const CHUNK_PREFIX = "answerMirror:";
/** chrome.storage.sync allows 8,192 bytes per item, including the key. */
export const CHUNK_BYTES = 7_500;
/** Leaves room in the 102,400-byte total for settings. */
export const MIRROR_BUDGET_BYTES = 80_000;

const CompactSchema = z.tuple([
  z.string(), // question
  AnswerValueSchema,
  FieldTypeSchema,
  z.string(), // scope
  z.array(z.string()).optional(),
]);
type Compact = z.infer<typeof CompactSchema>;

const MetaSchema = z.object({
  chunks: z.number().int().nonnegative(),
  count: z.number().int().nonnegative(),
  hash: z.string(),
  updatedAt: z.string(),
  tooLarge: z.boolean().optional(),
});
export type MirrorMeta = z.infer<typeof MetaSchema>;

function compact(entry: AnswerBankEntry): Compact {
  return entry.options
    ? [entry.question, entry.answer, entry.fieldType, entry.scope, entry.options]
    : [entry.question, entry.answer, entry.fieldType, entry.scope];
}

const bytes = (text: string) => new TextEncoder().encode(text).length;

/**
 * Splits the text into pieces that each fit one sync item. Sizes count the
 * piece as storage keeps it: JSON, so quotes and backslashes take two bytes.
 */
export function chunkText(text: string, size = CHUNK_BYTES): string[] {
  const chunks: string[] = [];
  let current = "";
  let used = 2; // the surrounding quotes
  for (const char of text) {
    const cost = bytes(JSON.stringify(char)) - 2;
    if (used + cost > size) {
      chunks.push(current);
      current = "";
      used = 2;
    }
    current += char;
    used += cost;
  }
  if (current || chunks.length === 0) chunks.push(current);
  return chunks;
}

export async function loadMirrorMeta(): Promise<MirrorMeta | undefined> {
  const stored: unknown = (await browser.storage.sync.get(MIRROR_META_KEY))[MIRROR_META_KEY];
  const parsed = MetaSchema.safeParse(stored);
  return parsed.success ? parsed.data : undefined;
}

/** Writes the mirror when the answers changed. Returns what was stored. */
export async function pushAnswerMirror(db: JobCopilotDB, now = new Date()): Promise<MirrorMeta> {
  const entries = (await db.answerBank.toArray())
    .filter((a) => a.status === "active" && !a.sensitive)
    .sort((a, b) => a.question.localeCompare(b.question));
  const text = JSON.stringify(entries.map(compact));
  const hash = (await sha256Hex(text)).slice(0, 16);
  const before = await loadMirrorMeta();
  if (before?.hash === hash) return before;

  const oldKeys = Array.from(
    { length: before?.chunks ?? 0 },
    (_, i) => `${CHUNK_PREFIX}${String(i)}`,
  );
  const updatedAt = now.toISOString();
  if (bytes(JSON.stringify(text)) > MIRROR_BUDGET_BYTES) {
    const meta: MirrorMeta = { chunks: 0, count: entries.length, hash, updatedAt, tooLarge: true };
    if (oldKeys.length) await browser.storage.sync.remove(oldKeys);
    await browser.storage.sync.set({ [MIRROR_META_KEY]: meta });
    return meta;
  }
  const chunks = chunkText(text);
  const meta: MirrorMeta = { chunks: chunks.length, count: entries.length, hash, updatedAt };
  const stale = oldKeys.slice(chunks.length);
  if (stale.length) await browser.storage.sync.remove(stale);
  await browser.storage.sync.set({
    ...Object.fromEntries(chunks.map((c, i) => [`${CHUNK_PREFIX}${String(i)}`, c])),
    [MIRROR_META_KEY]: meta,
  });
  return meta;
}

/** Adds answers from the mirror that this device does not have (same question and scope). */
export async function pullAnswerMirror(db: JobCopilotDB, now = new Date()): Promise<number> {
  const meta = await loadMirrorMeta();
  if (!meta || meta.tooLarge || meta.chunks === 0) return 0;
  const keys = Array.from({ length: meta.chunks }, (_, i) => `${CHUNK_PREFIX}${String(i)}`);
  const stored = await browser.storage.sync.get(keys);
  const text = keys.map((k) => (typeof stored[k] === "string" ? stored[k] : "")).join("");
  let rows: Compact[];
  try {
    rows = z.array(CompactSchema).parse(JSON.parse(text));
  } catch {
    return 0; // A half-synced mirror: try again next time.
  }
  const local = await db.answerBank.toArray();
  const have = new Set(local.map((a) => `${a.scope}|${a.normalized}`));
  const added: AnswerBankEntry[] = [];
  for (const [question, answer, fieldType, scope, options] of rows) {
    const entry = await newAnswer(
      {
        question,
        answer,
        fieldType,
        sensitive: false,
        ...(options && { options }),
        ...(scope === "global" || scope.startsWith("company:")
          ? { scope: scope as AnswerBankEntry["scope"] }
          : {}),
      },
      now,
    );
    const key = `${entry.scope}|${entry.normalized}`;
    if (have.has(key)) continue;
    have.add(key);
    added.push(entry);
  }
  if (added.length) await db.answerBank.bulkPut(added);
  return added.length;
}

/** Pull first (answers made elsewhere), then push this device's answers. */
export async function syncAnswerMirror(db: JobCopilotDB): Promise<MirrorMeta> {
  await pullAnswerMirror(db);
  return pushAnswerMirror(db);
}
