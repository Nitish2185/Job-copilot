/**
 * Whole-phrase boundary rules shared by the skill tagger and the location parser.
 * Mirrored in Go (crawler/internal/textnorm). Inputs are normalizeForMatching output.
 *
 * - If the phrase starts with a word character [a-z0-9], the character before it
 *   must not be one.
 * - If the phrase ends with a word character, the character after it must not be
 *   a word character, "+" or "#". In strict mode "-", "&" and "'" also block.
 */
import { isWordChar } from "./normalize";

const STRICT_EXTRA_BLOCKERS = new Set(["-", "&", "'"]);

export function phraseStartsOk(text: string, start: number, phrase: string): boolean {
  if (!isWordChar(phrase[0])) return true;
  return start === 0 || !isWordChar(text[start - 1]);
}

export function phraseEndsOk(text: string, end: number, phrase: string, strict: boolean): boolean {
  if (!isWordChar(phrase[phrase.length - 1])) return true;
  const next = text[end];
  if (next === undefined) return true;
  if (isWordChar(next) || next === "+" || next === "#") return false;
  return !(strict && STRICT_EXTRA_BLOCKERS.has(next));
}

/** True if the phrase occurs in the text as a whole phrase. */
export function containsPhrase(text: string, phrase: string, strict = false): boolean {
  let at = text.indexOf(phrase);
  while (at !== -1) {
    if (
      phraseStartsOk(text, at, phrase) &&
      phraseEndsOk(text, at + phrase.length, phrase, strict)
    ) {
      return true;
    }
    at = text.indexOf(phrase, at + 1);
  }
  return false;
}

/**
 * Longest-first phrase matching with claims: an occurrence fully inside a span
 * already claimed by a longer phrase is skipped. Calls `onMatch` for each accepted
 * occurrence. `phrases` must already be sorted with comparePhrases.
 */
export function matchClaimingPhrases<T extends { text: string }>(
  text: string,
  phrases: readonly T[],
  onMatch: (phrase: T) => void,
): void {
  const claimed: [number, number][] = [];
  const insideClaim = (start: number, end: number) =>
    claimed.some(([s, e]) => s <= start && end <= e);

  for (const phrase of phrases) {
    let at = text.indexOf(phrase.text);
    while (at !== -1) {
      const end = at + phrase.text.length;
      if (
        phraseStartsOk(text, at, phrase.text) &&
        phraseEndsOk(text, end, phrase.text, false) &&
        !insideClaim(at, end)
      ) {
        onMatch(phrase);
        claimed.push([at, end]);
      }
      at = text.indexOf(phrase.text, at + 1);
    }
  }
}

/** Longest first, then by text, then by key: a total order Go and TypeScript agree on. */
export function comparePhrases(
  a: { text: string; key: string },
  b: { text: string; key: string },
): number {
  if (a.text.length !== b.text.length) return b.text.length - a.text.length;
  if (a.text !== b.text) return a.text < b.text ? -1 : 1;
  if (a.key === b.key) return 0;
  return a.key < b.key ? -1 : 1;
}
