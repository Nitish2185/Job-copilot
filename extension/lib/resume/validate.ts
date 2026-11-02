/**
 * The tailoring validator (spec 14.4): code, not AI, checks every generated text.
 * No new skills, no new numbers, no new employers or certifications, and word
 * limits. A text that fails is replaced by the original and the issue recorded.
 */
import { SKILLS, tagSkills, withImpliedSkills, type Profile } from "@job-copilot/shared";

export const SUMMARY_MAX_WORDS = 60;
export const BULLET_MAX_WORDS = 30;

export function wordCount(text: string): number {
  return text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
}

// ---------------------------------------------------------------- skills

/** Skills the generated text names that are not allowed (the tagger also adds implied skills). */
export function newSkills(text: string, allowed: ReadonlySet<string>): string[] {
  return tagSkills(text).filter((id) => !allowed.has(id));
}

/** The allowed skills: the given ones, what they imply, and skills already in the original text. */
export function allowedSkills(
  ids: Iterable<string>,
  originals: readonly string[] = [],
): Set<string> {
  return withImpliedSkills([...ids, ...originals.flatMap((t) => tagSkills(t))]);
}

// ---------------------------------------------------------------- numbers

/** Every number in the text, normalized: "1,200" -> "1200", "30%" -> "30", "4+" -> "4". */
export function extractNumbers(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(/(?<![\w.])\d+(?:[.,]\d+)*/g)) {
    const raw = match[0];
    // "1,200" and "12,00,000" are thousands separators; "3.5" is a decimal.
    const normalized = /^\d{1,3}(,\d{2,3})+$/.test(raw)
      ? raw.replace(/,/g, "")
      : raw.replace(",", ".");
    out.push(String(Number(normalized)));
  }
  return out;
}

/** Numbers in the generated text that appear in none of the original texts or allowed numbers. */
export function newNumbers(
  text: string,
  originals: readonly string[],
  allowed: readonly number[] = [],
): string[] {
  const known = new Set([...originals.flatMap(extractNumbers), ...allowed.map(String)]);
  return [...new Set(extractNumbers(text))].filter((n) => !known.has(n));
}

// ---------------------------------------------------------------- names

/** Well-known employers; mentioning one the profile does not contain is a violation. */
const FAMOUS_EMPLOYERS = [
  "google",
  "microsoft",
  "amazon",
  "meta",
  "facebook",
  "apple",
  "netflix",
  "uber",
  "airbnb",
  "flipkart",
  "infosys",
  "tcs",
  "tata consultancy",
  "wipro",
  "accenture",
  "ibm",
  "oracle",
  "salesforce",
  "adobe",
  "deloitte",
  "goldman sachs",
  "jpmorgan",
  "morgan stanley",
  "swiggy",
  "zomato",
  "paytm",
  "razorpay",
  "stripe",
  "atlassian",
  "shopify",
  "twitter",
  "linkedin",
  "nvidia",
  "intel",
  "cognizant",
  "capgemini",
  "hcl",
  "tech mahindra",
];

const COMPANY_SUFFIX =
  /\b((?:[A-Z][\w&.-]*\s+){0,3}[A-Z][\w&.-]*)\s+(?:Inc|Ltd|LLC|Corp|Corporation|Technologies|Labs|Pvt|GmbH|Solutions|Systems)\b\.?/g;

const lower = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Names the profile knows: employers, schools, certifications, projects and every skill name. */
export function knownNames(profile: Profile, extra: readonly string[] = []): string[] {
  const names = [
    ...profile.experience.map((e) => e.company),
    ...profile.education.map((e) => e.institution),
    ...profile.certifications.flatMap((c) => [c.name, c.issuer ?? ""]),
    ...profile.projects.map((p) => p.name),
    ...SKILLS.flatMap((s) => [s.display, ...s.aliases]),
    ...extra,
  ];
  return [...new Set(names.map(lower).filter((n) => n.length > 1))].sort(
    (a, b) => b.length - a.length,
  );
}

function containsWord(text: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`).test(text);
}

/**
 * Employer and certification names in the text that the profile does not
 * contain (best effort): well-known employers, names ending in Inc/Ltd/Labs...,
 * and certifications.
 */
export function unknownNames(
  text: string,
  known: readonly string[],
  certifications: readonly string[],
): string[] {
  const out: string[] = [];
  let rest = lower(text);
  // Remove known names first, so "Amazon Web Services" (a skill) is not "Amazon".
  for (const name of known) {
    if (containsWord(rest, name)) {
      rest = rest.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), " ");
    }
  }
  for (const name of FAMOUS_EMPLOYERS) if (containsWord(rest, name)) out.push(name);
  for (const match of text.matchAll(COMPANY_SUFFIX)) {
    const phrase = lower(match[0].replace(/\.$/, ""));
    if (!known.some((k) => phrase.includes(k) || k.includes(phrase))) out.push(match[0].trim());
  }
  if (/certif/i.test(text) && !certifications.some((c) => containsWord(lower(text), lower(c)))) {
    out.push("a certification");
  }
  return [...new Set(out)];
}

// ---------------------------------------------------------------- one text

export interface TextRules {
  allowedSkills: ReadonlySet<string>;
  /** Original texts whose numbers may be reused. */
  originals: readonly string[];
  allowedNumbers?: readonly number[];
  known: readonly string[];
  certifications: readonly string[];
  maxWords: number;
}

/** Problems with one generated text, in plain words; empty when it passes. */
export function checkText(text: string, rules: TextRules): string[] {
  const problems: string[] = [];
  const words = wordCount(text);
  if (words === 0) problems.push("is empty");
  if (words > rules.maxWords)
    problems.push(`has ${String(words)} words (limit ${String(rules.maxWords)})`);
  const skills = newSkills(text, rules.allowedSkills);
  if (skills.length > 0) problems.push(`adds skills you did not list (${skills.join(", ")})`);
  const numbers = newNumbers(text, rules.originals, rules.allowedNumbers);
  if (numbers.length > 0)
    problems.push(`adds numbers that are not in your profile (${numbers.join(", ")})`);
  const names = unknownNames(text, rules.known, rules.certifications);
  if (names.length > 0)
    problems.push(`names something that is not in your profile (${names.join(", ")})`);
  return problems;
}
