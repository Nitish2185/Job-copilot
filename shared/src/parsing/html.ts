/**
 * Job-description HTML to plain text. Port of crawler/internal/textnorm/html.go;
 * both pass shared/testcases/html.cases.json. Works without a DOM, so it runs in
 * the extension's service worker.
 */
import { decodeHTML } from "entities";
import { collapseWhitespace } from "./normalize";

const COMMENT = /<!--[\s\S]*?-->/g;
const SCRIPT_BLOCK = /<script\b[\s\S]*?<\/script\s*>/gi;
const STYLE_BLOCK = /<style\b[\s\S]*?<\/style\s*>/gi;
const BLOCK_TAG =
  /<\s*\/?\s*(?:br|p|div|li|ul|ol|h[1-6]|tr|table|section|article|header|footer|blockquote|pre|hr)\b[^>]*>/gi;
const ANY_TAG = /<[^>]*>/g;

function joinLines(text: string): string {
  return text
    .split("\n")
    .map((line) => collapseWhitespace(line))
    .filter((line) => line !== "")
    .join("\n");
}

/**
 * Scripts, styles and comments removed, block elements become line breaks, other
 * tags dropped, entities decoded, whitespace collapsed per line, empty lines removed.
 */
export function htmlToText(html: string): string {
  const stripped = html
    .replace(COMMENT, " ")
    .replace(SCRIPT_BLOCK, " ")
    .replace(STYLE_BLOCK, " ")
    .replace(BLOCK_TAG, "\n")
    .replace(ANY_TAG, " ");
  return joinLines(decodeHTML(stripped));
}

/** Formats API plain text like htmlToText output. */
export function plainText(text: string): string {
  return joinLines(text.replaceAll("\r\n", "\n"));
}

/** Decodes HTML entities once (Greenhouse sends entity-escaped HTML). */
export function decodeEntities(text: string): string {
  return decodeHTML(text);
}
