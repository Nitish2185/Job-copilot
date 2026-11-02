/**
 * Option matching helpers (spec 16.3): pick the option that means the same as
 * the answer. Yes/No synonyms, notice-period, year and CTC buckets, countries,
 * and "decline to self-identify".
 */
import { LOCATIONS } from "@job-copilot/shared";

const norm = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+<>.\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const YES =
  /^(yes|y|true|i do|i am|i have|i will|i can|i would|yes i|sure|absolutely|definitely)\b/;
const NO =
  /^(no|n|false|i do not|i don t|i am not|i m not|i have not|i haven t|i will not|i won t|i can not|i cannot|not)\b/;

export function yesNoOption(options: readonly string[], value: boolean): string | undefined {
  const pattern = value ? YES : NO;
  return options.find((o) => pattern.test(norm(o)) && !(value && NO.test(norm(o))));
}

const DECLINE =
  /(decline|prefer not|do not wish|don t wish|choose not|not to (say|disclose|answer|self identify)|rather not|i don t want|i do not want|not specified|not disclosed)/;

/** The "decline to self-identify" choice, if the question offers one. */
export function declineOption(options: readonly string[]): string | undefined {
  return options.find((o) => DECLINE.test(norm(o)));
}

/** Exact match after normalization, then a clear containment either way. */
export function textOption(
  options: readonly string[],
  value: string,
  aliases: readonly string[] = [],
): string | undefined {
  const wanted = [value, ...aliases].map(norm).filter((v) => v !== "");
  for (const w of wanted) {
    const exact = options.find((o) => norm(o) === w);
    if (exact) return exact;
  }
  for (const w of wanted) {
    const contained = options.filter((o) => {
      const n = norm(o);
      return (
        (n.length >= 3 && w.includes(n)) ||
        (w.length >= 3 && new RegExp(`(^|\\s)${escape(w)}(\\s|$)`).test(n))
      );
    });
    if (contained.length === 1) return contained[0];
  }
  return undefined;
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface Range {
  min: number;
  max: number;
}

type Unit = "days" | "years" | "lakhs";

function toUnit(n: number, word: string, unit: Unit): number {
  if (unit === "days") {
    if (word.includes("month")) return n * 30;
    if (word.includes("week")) return n * 7;
    if (word.includes("year")) return n * 365;
    return n;
  }
  if (unit === "lakhs") {
    if (/(cr|crore)/.test(word)) return n * 100;
    if (/\bk\b/.test(word)) return n / 100;
    if (n >= 10_000) return n / 100_000;
    return n;
  }
  if (word.includes("month")) return n / 12;
  return n;
}

/** The numeric range an option covers: "0-15 days", "1 month", "5+", "More than 3 months". */
export function parseRange(option: string, unit: Unit): Range | undefined {
  const o = norm(option).replace(/,/g, "");
  if (unit === "days" && /\b(immediate|immediately|currently available|0 days)\b/.test(o)) {
    return { min: 0, max: 0 };
  }
  if (unit === "years" && /\b(fresher|no experience|entry level)\b/.test(o))
    return { min: 0, max: 0.99 };
  const nums = [...o.matchAll(/(\d+(?:\.\d+)?)\s*([a-z]*)/g)].map((m) => ({
    n: Number(m[1]),
    word: m[2] ?? "",
  }));
  const unitWord =
    /\b(months?|weeks?|days?|years?|yrs?|lpa|lakhs?|lacs?|cr|crores?|k)\b/.exec(o)?.[1] ?? "";
  const value = (i: number) => {
    const item = nums[i];
    if (!item) return undefined;
    return toUnit(item.n, item.word || unitWord, unit);
  };
  const first = value(0);
  if (first === undefined) return undefined;
  if (/\b(more than|above|over|greater than|at least|minimum)\b|>|\+/.test(o)) {
    return {
      min: /\b(more than|above|over|greater than)\b|>/.test(o) ? first + 0.0001 : first,
      max: Infinity,
    };
  }
  if (/\b(less than|below|under|up to|upto|within|or less|max(imum)?)\b|</.test(o)) {
    return { min: 0, max: /\b(less than|below|under)\b|</.test(o) ? first - 0.0001 : first };
  }
  const second = value(1);
  if (second !== undefined && /(\d\s*[a-z]*\s*(-|to|–)\s*\d)/.test(o))
    return { min: first, max: second };
  return { min: first, max: first };
}

/** The option whose range holds the number (a half-open match wins over a boundary match). */
export function rangeOption(
  options: readonly string[],
  value: number,
  unit: Unit,
): string | undefined {
  const ranged = options
    .map((option) => ({ option, range: parseRange(option, unit) }))
    .filter((r): r is { option: string; range: Range } => r.range !== undefined);
  const inside = ranged.filter((r) => value >= r.range.min && value <= r.range.max);
  const strict = inside.find((r) => value < r.range.max || r.range.min === r.range.max);
  if (strict) return strict.option;
  if (inside[0]) return inside[0].option;
  // No bucket holds it exactly (e.g. 45 days with only 30 and 60): the next one up.
  const above = ranged
    .filter((r) => r.range.min >= value)
    .sort((a, b) => a.range.min - b.range.min);
  return above[0]?.option;
}

/** A country option by code or any of its names ("IN", "India", "Bharat"). */
export function countryOption(options: readonly string[], code: string): string | undefined {
  const country = LOCATIONS.countries.find((c) => c.code === code.toUpperCase());
  if (!country) return textOption(options, code);
  return textOption(options, country.name, [country.code, ...country.names]);
}

/** Splits a phone number into country code and national number (spec 16.3 phone rule). */
export function splitPhone(phone: string): { countryCode?: string; national: string } {
  const compact = phone.replace(/[^\d+]/g, "");
  const match = /^\+(91|1|44|61|65|971|49|33|31|353|81|86)(\d{6,12})$/.exec(compact);
  if (match?.[1] && match[2]) return { countryCode: `+${match[1]}`, national: match[2] };
  return { national: compact.replace(/^\+/, "") };
}

/** E.164 when the country code is known ("+919999901234"), else the digits as written. */
export function e164(phone: string): string {
  const { countryCode, national } = splitPhone(phone);
  return countryCode ? `${countryCode}${national}` : phone.trim();
}
