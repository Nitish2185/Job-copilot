/**
 * Answer bank basics: question normalization, fingerprints and lookup (exact,
 * then token Jaccard >= 0.9). The apply engine builds on this in Phase 7.
 */
import {
  sha256Hex,
  type AnswerBankEntry,
  type AnswerValue,
  type FieldType,
} from "@job-copilot/shared";

export const FUZZY_THRESHOLD = 0.9;

/** Lowercase, punctuation and "*" stripped, whitespace collapsed (spec 16.3). */
export function normalizeQuestion(question: string): string {
  return question
    .toLowerCase()
    .replace(/[*?:.,;!()[\]{}"'`’“”]/g, " ")
    .replace(/[^\p{L}\p{N}\s/&+-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function questionFingerprint(question: string): Promise<string> {
  return sha256Hex(normalizeQuestion(question));
}

function tokens(text: string): Set<string> {
  return new Set(
    normalizeQuestion(text)
      .split(" ")
      .filter((t) => t !== ""),
  );
}

export function jaccard(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  let both = 0;
  for (const t of ta) if (tb.has(t)) both++;
  return both / (ta.size + tb.size - both);
}

/** True when a stored answer can be used for this field (type and options fit). */
export function answerFits(
  answer: AnswerValue,
  fieldType: FieldType,
  options?: readonly string[],
): boolean {
  switch (fieldType) {
    case "number":
      return (
        typeof answer === "number" ||
        (typeof answer === "string" && answer.trim() !== "" && Number.isFinite(Number(answer)))
      );
    case "checkbox":
      if (typeof answer === "boolean") return true;
      if (Array.isArray(answer) && options) return answer.every((a) => options.includes(a));
      return false;
    case "select":
    case "radio":
      return typeof answer === "string" && (!options || options.includes(answer));
    default:
      return typeof answer === "string" || typeof answer === "number";
  }
}

/**
 * Finds a reusable answer: exact fingerprint first, then the most similar active
 * question with Jaccard >= 0.9. Pending AI answers are never reused.
 */
export async function findAnswer(
  entries: readonly AnswerBankEntry[],
  question: string,
  fieldType: FieldType,
  options?: readonly string[],
  scope?: string,
): Promise<AnswerBankEntry | undefined> {
  const usable = entries.filter(
    (e) =>
      e.status === "active" &&
      (e.scope === "global" || e.scope === scope) &&
      answerFits(e.answer, fieldType, options),
  );
  const fingerprint = await questionFingerprint(question);
  const exact = usable.filter((e) => e.fingerprint === fingerprint);
  if (exact.length > 0) return exact.find((e) => e.scope !== "global") ?? exact[0];
  let best: AnswerBankEntry | undefined;
  let bestScore = FUZZY_THRESHOLD;
  for (const e of usable) {
    const score = jaccard(question, e.question);
    if (score >= bestScore) {
      best = e;
      bestScore = score;
    }
  }
  return best;
}

export async function newAnswer(
  input: Pick<AnswerBankEntry, "question" | "answer" | "fieldType" | "sensitive"> &
    Partial<Pick<AnswerBankEntry, "options" | "scope" | "source" | "status">>,
  now: Date,
): Promise<AnswerBankEntry> {
  const entry: AnswerBankEntry = {
    id: crypto.randomUUID(),
    question: input.question.trim(),
    normalized: normalizeQuestion(input.question),
    fingerprint: await questionFingerprint(input.question),
    answer: input.answer,
    fieldType: input.fieldType,
    scope: input.scope ?? "global",
    source: input.source ?? "user",
    status: input.status ?? "active",
    sensitive: input.sensitive,
    timesUsed: 0,
    createdAt: now.toISOString().replace(/\.\d{3}Z$/, "Z"),
  };
  if (input.options) entry.options = [...input.options];
  return entry;
}
