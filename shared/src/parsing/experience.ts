/**
 * Years-of-experience parser (spec 7.4). The Go crawler has a port in
 * crawler/internal/parsing; both pass shared/testcases/experience.cases.json.
 *
 * 1. Normalize the text (normalizeForMatching).
 * 2. Find every "N years", "N+ years", "N-M years", "N to M yrs", "at least N years",
 *    "up to N years" ... (one regex, leftmost-first, the same in JS and Go's RE2).
 * 3. Drop numbers over 30 and phrases followed by "ago", "old", "history",
 *    "warranty", "degree" or "of age".
 * 4. If any candidate sits near "experience"/"exp"/"yoe", use only those. Otherwise
 *    use candidates with a range, a "+" or a qualifier (plain "N years" alone is
 *    too often about something else).
 * 5. min = smallest minimum, max = largest maximum (dropped if below min).
 */
import { normalizeForMatching } from "./normalize";

export interface ExperienceRange {
  min?: number;
  max?: number;
}

const MAX_YEARS = 30;
const LOOK_BEHIND_CHARS = 40;
const LOOK_AHEAD_CHARS = 50;
const FOLLOW_CHARS = 25;

const EXPERIENCE_PATTERN =
  /(?:\b(at least|atleast|minimum of|minimum|min\.?|over|more than|up to|upto)\s*)?\b(\d{1,2}(?:\.\d{1,2})?)\s*(?:(?:-|to)\s*(\d{1,2}(?:\.\d{1,2})?)\s*)?(\+)?\s*(?:years?|yrs?|yoe)\b/g;

const NOT_EXPERIENCE_AFTER = /\b(ago|old|history|warranty|degree|of age)\b/;
const EXPERIENCE_NEARBY = /experien|\bexp\b|\byoe\b/;

interface Candidate {
  min?: number;
  max?: number;
  near: boolean;
  plain: boolean;
}

export function parseExperience(input: string): ExperienceRange {
  const text = normalizeForMatching(input);
  const candidates: Candidate[] = [];

  for (const match of text.matchAll(EXPERIENCE_PATTERN)) {
    const [whole, qualifier, first, second, plus] = match;
    const start = match.index;
    const end = start + whole.length;
    const a = Number(first);
    const b = second === undefined ? undefined : Number(second);

    if (a > MAX_YEARS || (b !== undefined && b > MAX_YEARS)) continue;
    if (b !== undefined && b < a) continue;
    if (NOT_EXPERIENCE_AFTER.test(text.slice(end, end + FOLLOW_CHARS))) continue;

    const window = text.slice(Math.max(0, start - LOOK_BEHIND_CHARS), end + LOOK_AHEAD_CHARS);
    const near = EXPERIENCE_NEARBY.test(window);

    if (b !== undefined) {
      candidates.push({ min: a, max: b, near, plain: false });
    } else if (qualifier === "up to" || qualifier === "upto") {
      candidates.push({ max: a, near, plain: false });
    } else {
      candidates.push({ min: a, near, plain: qualifier === undefined && plus === undefined });
    }
  }

  const nearOnes = candidates.filter((c) => c.near);
  const used = nearOnes.length > 0 ? nearOnes : candidates.filter((c) => !c.plain);

  const mins = used.flatMap((c) => (c.min === undefined ? [] : [c.min]));
  const maxes = used.flatMap((c) => (c.max === undefined ? [] : [c.max]));
  const result: ExperienceRange = {};
  if (mins.length > 0) result.min = Math.min(...mins);
  if (maxes.length > 0) {
    const max = Math.max(...maxes);
    if (result.min === undefined || max >= result.min) result.max = max;
  }
  return result;
}
