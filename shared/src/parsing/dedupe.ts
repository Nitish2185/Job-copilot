/**
 * De-duplication key (spec 13.8): normalize(company) | normalize(title) |
 * normalize(primary location). The same job found on several sources gets the
 * same key.
 */
import { normalizeForMatching } from "./normalize";

const COMPANY_SUFFIXES = new Set([
  "inc",
  "llc",
  "ltd",
  "limited",
  "pvt",
  "private",
  "corp",
  "corporation",
  "co",
  "company",
  "gmbh",
  "plc",
  "sa",
  "ag",
  "bv",
  "technologies",
  "technology",
  "labs",
]);

function words(text: string): string[] {
  return normalizeForMatching(text)
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w !== "");
}

/** Lowercase words without punctuation or legal suffixes ("Acme Pvt. Ltd." -> "acme"). */
export function normalizeCompanyName(name: string): string {
  const parts = words(name);
  while (parts.length > 1 && COMPANY_SUFFIXES.has(parts[parts.length - 1] ?? "")) parts.pop();
  return parts.join(" ");
}

export function dedupeKey(company: string, title: string, primaryLocation = ""): string {
  return [
    normalizeCompanyName(company),
    words(title).join(" "),
    words(primaryLocation).join(" "),
  ].join("|");
}
