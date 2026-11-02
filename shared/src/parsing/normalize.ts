/**
 * Text normalization shared by the skill tagger and the parsers.
 *
 * The Go crawler implements the same rules (crawler/internal/textnorm), and both
 * run the golden cases in shared/testcases, so keep the two in step.
 */

import foldData from "../../data/fold.json";

/** Unicode dashes that become "-": hyphen, non-breaking hyphen, figure/en/em dash, bar, minus. */
const DASH_CODE_POINTS = new Set([0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2015, 0x2212]);

/** Accented Latin letters folded to ASCII ("ü" -> "u", "ß" -> "ss"), keyed by code point. */
const FOLD = new Map(
  Object.entries(foldData.map as Record<string, string>).map(([hex, ascii]) => [
    Number.parseInt(hex, 16),
    ascii,
  ]),
);

const isCombiningMark = (code: number) => code >= 0x300 && code <= 0x36f;

/**
 * Lowercases ASCII letters, folds accented Latin letters to ASCII (fold.json),
 * drops combining accent marks, turns Unicode dashes into "-", and turns every
 * other non-ASCII character and every control character into a space. Then
 * collapses runs of spaces and trims. The result is pure ASCII, so string
 * positions mean the same thing in TypeScript (UTF-16) and Go (bytes).
 */
export function normalizeForMatching(input: string): string {
  let out = "";
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x41 && code <= 0x5a) {
      out += String.fromCharCode(code + 0x20);
    } else if (code < 0x20 || code === 0x7f) {
      out += " ";
    } else if (code < 0x80) {
      out += ch;
    } else if (isCombiningMark(code)) {
      continue;
    } else if (DASH_CODE_POINTS.has(code)) {
      out += "-";
    } else {
      out += FOLD.get(code) ?? " ";
    }
  }
  return collapseSpaces(out);
}

/** Collapses runs of ASCII spaces into one and trims. Input must already be space-normalized. */
function collapseSpaces(text: string): string {
  return text
    .split(" ")
    .filter((part) => part !== "")
    .join(" ");
}

/**
 * Collapses every run of whitespace into a single space and trims. "Whitespace" is
 * JavaScript's \s plus U+0085, which equals Go's unicode.IsSpace plus U+FEFF.
 */
export function collapseWhitespace(text: string): string {
  return text.replace(/[\s\u0085]+/gu, " ").trim();
}

/** Word characters for boundary checks: ASCII lowercase letters and digits. */
export function isWordChar(ch: string | undefined): boolean {
  if (ch === undefined || ch.length === 0) return false;
  const code = ch.charCodeAt(0);
  return (code >= 0x61 && code <= 0x7a) || (code >= 0x30 && code <= 0x39);
}

/**
 * Feed snippet: whitespace collapsed, then whole characters taken while the
 * UTF-16 length stays within `max`. That always passes the schema limit, never
 * splits a character, and is computed the same way in Go.
 */
export function makeSnippet(text: string, max = 300): string {
  let out = "";
  for (const ch of collapseWhitespace(text)) {
    if (out.length + ch.length > max) break;
    out += ch;
  }
  return out;
}
