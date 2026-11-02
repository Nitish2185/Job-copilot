/**
 * Removes contact details before text is sent to an AI provider (spec 11.5).
 * Contact fields are extracted locally and never sent; resumes are rendered
 * locally, so the AI never needs them.
 */

export interface Identity {
  fullName?: string;
  email?: string;
  phone?: string;
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Phone numbers: international (+code), Indian mobiles, US formats. Years and ranges are left alone. */
const PHONE_PATTERNS = [
  /\+\d{1,3}[\s.-]?\(?\d{1,5}\)?(?:[\s.-]?\d{2,5}){1,4}/g,
  /\(\d{3}\)\s?\d{3}[\s.-]\d{4}\b/g,
  /\b\d{3}[.-]\d{3}[.-]\d{4}\b/g,
  /\b0?[6-9]\d{4}[\s-]?\d{5}\b/g,
];

const DATE_OF_BIRTH =
  /\b(?:date\s+of\s+birth|d\.?\s?o\.?\s?b\.?|born(?:\s+on)?)\s*[:-]?\s*(?:\d{1,2}[\s/.-](?:\d{1,2}|[A-Za-z]{3,9})[\s/.-]\d{2,4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2})/gi;

/** Address lines: house/flat numbers, Indian PIN codes, US ZIP+street patterns. */
const ADDRESS_PATTERNS = [
  /\b(?:flat|house|h\.?\s?no|plot|door)\s*(?:no\.?|number|#)?\s*[:-]?\s*[\w/-]+,[^\n]{0,120}/gi,
  /\b\d{1,5}[A-Za-z]?\s*,?\s+[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*\s+(?:street|st|road|rd|lane|ln|avenue|ave|nagar|marg|cross|main|layout|colony|sector|block)\b\.?[^\n]{0,80}/gi,
  /\b(?:pin(?:\s*code)?|pincode)\s*[:-]?\s*\d{3}\s?\d{3}\b/gi,
];

/** Profile links name the person; repository links (github.com/user/repo) are kept. */
const LINKEDIN_PROFILE = /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9_%-]+\/?/gi;
const GITHUB_PROFILE =
  /(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})(?![A-Za-z0-9/-])/gi;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Replaces the user's name (full name and each part of 3+ letters) with [NAME]. */
function redactName(text: string, fullName: string): string {
  const parts = fullName
    .split(/\s+/)
    .map((p) => p.replace(/[^\p{L}'-]/gu, ""))
    .filter((p) => p.length >= 3);
  let out = text;
  const full = fullName.trim();
  if (full.length >= 3) out = out.replace(new RegExp(escapeRegExp(full), "gi"), "[NAME]");
  for (const part of parts) {
    out = out.replace(
      new RegExp(`(?<![\\p{L}])${escapeRegExp(part)}(?![\\p{L}])`, "giu"),
      "[NAME]",
    );
  }
  return out;
}

export function redactText(text: string, identity: Identity = {}): string {
  let out = text;
  if (identity.email) out = out.replace(new RegExp(escapeRegExp(identity.email), "gi"), "[EMAIL]");
  out = out.replace(EMAIL, "[EMAIL]");
  out = out.replace(LINKEDIN_PROFILE, "[LINKEDIN]");
  out = out.replace(GITHUB_PROFILE, "[GITHUB]");
  out = out.replace(DATE_OF_BIRTH, "[DATE_OF_BIRTH]");
  for (const pattern of ADDRESS_PATTERNS) out = out.replace(pattern, "[ADDRESS]");
  for (const pattern of PHONE_PATTERNS) out = out.replace(pattern, "[PHONE]");
  if (identity.fullName) out = redactName(out, identity.fullName);
  return out;
}

/** Redacts every string inside a JSON-like value. */
export function redactDeep<T>(value: T, identity: Identity = {}): T {
  if (typeof value === "string") return redactText(value, identity) as T;
  if (Array.isArray(value)) return value.map((v: unknown) => redactDeep(v, identity)) as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]: [string, unknown]) => [k, redactDeep(v, identity)]),
    ) as T;
  }
  return value;
}

export interface ExtractedContacts {
  emails: string[];
  phones: string[];
  linkedinUrl?: string;
  githubUsername?: string;
  portfolioUrls: string[];
}

const LINKEDIN = /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9_-]+\/?/i;
const GITHUB =
  /(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))(?![A-Za-z0-9-])/i;
const URL_PATTERN = /\bhttps?:\/\/[^\s)>\]]+/gi;

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/** Contact details found locally in resume text (spec 10, step 3). */
export function extractContacts(text: string): ExtractedContacts {
  const emails = unique(text.match(EMAIL) ?? []);
  const found = unique(PHONE_PATTERNS.flatMap((p) => text.match(p) ?? []).map((p) => p.trim()));
  // "98765 43210" is also inside "+91 98765 43210": keep only the longest form.
  const phones = found.filter((p) => !found.some((other) => other !== p && other.includes(p)));
  const linkedin = LINKEDIN.exec(text)?.[0];
  const github = GITHUB.exec(text)?.[1];
  const portfolioUrls = unique(text.match(URL_PATTERN) ?? []).filter(
    (u) => !/linkedin\.com|github\.com/i.test(u),
  );
  const result: ExtractedContacts = { emails, phones, portfolioUrls };
  if (linkedin) result.linkedinUrl = linkedin.startsWith("http") ? linkedin : `https://${linkedin}`;
  if (github) result.githubUsername = github;
  return result;
}
