/**
 * Classifies a form question into a canonical key (spec 16.3) with keyword and
 * regex rules, before any AI is involved. Order matters: specific rules first.
 */
import { parseCountries, tagSkills } from "@job-copilot/shared";
import type { FieldKind } from "./discover";

export const SENSITIVE_KEYS = new Set([
  "sponsorship",
  "current_ctc",
  "expected_ctc",
  "salary_expectation",
  "notice_period",
  "serving_notice",
  "last_working_day",
  "relocate",
  "date_of_birth",
  "background_check_consent",
  "legal_attestation",
]);

export const EEO_KEYS = new Set([
  "gender",
  "pronouns",
  "race_ethnicity",
  "hispanic_latino",
  "veteran_status",
  "disability_status",
]);

/** Work authorization, sponsorship, pay, notice, relocation, DOB, checks and attestations (spec 2.3). */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key) || key.startsWith("work_authorization");
}

export interface Classifiable {
  question: string;
  kind: FieldKind;
  name?: string;
  autocomplete?: string;
  placeholder?: string;
}

const AUTOCOMPLETE: Record<string, string> = {
  "given-name": "first_name",
  "family-name": "last_name",
  name: "full_name",
  nickname: "preferred_name",
  email: "email",
  tel: "phone",
  "tel-national": "phone",
  "tel-country-code": "phone_country_code",
  "street-address": "address_line",
  "address-line1": "address_line",
  "address-level2": "city",
  "address-level1": "state",
  country: "country",
  "country-name": "country",
  "postal-code": "postal_code",
  organization: "current_company",
  "organization-title": "current_title",
  bday: "date_of_birth",
  url: "website",
};

/** [key, pattern] tested against the normalized question, in order. */
const RULES: [string, RegExp][] = [
  // Files first: "Upload your resume" must not become a text question.
  ["resume_file", /\b(resume|cv|curriculum vitae)\b/],
  ["cover_letter_file", /\bcover ?letter\b/],
  // Consent and attestations: never decided for the user.
  [
    "privacy_acknowledgement",
    /\b(privacy (notice|policy|statement)|data (processing|protection)|gdpr|personal data)\b/,
  ],
  [
    "background_check_consent",
    /\b(background (check|verification|screening)|criminal (record|history|conviction|offen[cs]e)|been convicted|drug (test|screen))\b/,
  ],
  [
    "legal_attestation",
    /\b(i (hereby )?(certify|confirm|attest|declare|acknowledge)|true and (complete|correct|accurate)|attest|terms (and|&) conditions|i agree|non ?compete|subject to any (agreement|restriction))\b/,
  ],
  // Work authorization and sponsorship.
  [
    "sponsorship",
    /\b(sponsor(ship)?|h ?1 ?b|visa (support|transfer)|require (a )?visa|need (a )?visa)\b/,
  ],
  [
    "work_authorization",
    /\b(authori[sz](ed|ation) to work|eligible to work|legally (able|allowed|permitted|eligible)|right to work|work (permit|authori[sz]ation)|permission to work|citizen(ship)?|permanent resident|green card|employment eligibility)\b/,
  ],
  // Pay.
  [
    "current_ctc",
    /\b(current|present|existing|last drawn) (ctc|salary|compensation|package|pay|annual salary|base salary)\b|\bctc\b.*\bcurrent\b|^ctc$/,
  ],
  ["expected_ctc", /\b(expected|desired|expect(ed)?) (ctc|package)\b|\bectc\b|\bctc\b.*\bexpect/],
  ["salary_currency", /\b(salary )?currency\b/],
  [
    "salary_expectation",
    /\b(salary|compensation|pay) (expectation|requirement|range|expected)|\b(expected|desired|target|minimum) (salary|compensation|pay|base)\b|what are you looking for in (terms of )?(compensation|salary)/,
  ],
  // Notice period and joining.
  ["serving_notice", /\b(serving|currently (on|in)) (your )?notice\b|\bon notice period\b/],
  ["last_working_day", /\b(last working (day|date)|lwd|relieving date)\b/],
  [
    "notice_period",
    /\bnotice( period)?\b|\b(immediate joiner|join immediately|how soon can you join|joining time|available to join)\b/,
  ],
  [
    "start_date",
    /\b(start date|earliest (start|date)|when can you (start|join|begin)|available (to start|from)|availability date|date (of )?availability)\b/,
  ],
  // Relocation and workplace.
  ["relocate", /\breloca(te|tion|ting)\b|\bwilling to move\b/],
  ["willing_onsite", /\b(on ?site|in (the )?office|from (the )?office|wfo|commute)\b/],
  ["willing_hybrid", /\bhybrid\b/],
  // Diversity (voluntary).
  ["hispanic_latino", /\bhispanic|latin[oax]\b/],
  ["race_ethnicity", /\b(race|ethnicity|ethnic (origin|background)|racial)\b/],
  ["veteran_status", /\bveteran|military (service|status)|armed forces\b/],
  ["disability_status", /\bdisabilit(y|ies)|disabled\b/],
  ["pronouns", /\bpronouns?\b/],
  ["gender", /\b(gender|sex)\b/],
  ["date_of_birth", /\b(date of birth|birth ?date|dob|d o b|birthday)\b/],
  // Experience.
  [
    "total_experience_months",
    /\b(total|overall|relevant|work|professional)?\s*experience\b.*\bmonths?\b|\bmonths? of experience\b/,
  ],
  [
    "total_experience_years",
    /\b(total|overall|relevant|work|professional|it|industry) (work )?experience\b|\byears of (total |overall |professional |work |relevant )?experience\b|\bexperience in years\b|\bhow many years\b.*\bexperience\b|^experience( years)?$/,
  ],
  [
    "current_company",
    /\b(current|present|most recent|latest) (company|employer|organi[sz]ation)\b|\b(company|employer) name\b|^employer$/,
  ],
  [
    "current_title",
    /\b(current|present|most recent|latest) (job )?(title|designation|role|position)\b|^(job )?title$|^designation$/,
  ],
  // Education.
  [
    "graduation_year",
    /\b(graduation|passing|completion) (year|date)\b|\byear of (graduation|passing|completion)\b/,
  ],
  ["gpa", /\b(gpa|cgpa|grade point|percentage|marks)\b/],
  ["education_institution", /\b(school|university|college|institut(e|ion))\b/],
  ["education_degree", /\b(degree|qualification|education|discipline|major|field of study)\b/],
  // Links.
  ["linkedin", /\blinked ?in\b/],
  ["github", /\bgit ?hub\b/],
  ["twitter", /\btwitter\b|\bx (profile|handle)\b/],
  ["portfolio", /\bportfolio\b/],
  ["website", /\b(website|personal (site|url|page)|blog|url)\b/],
  // Referral and source.
  [
    "referral_name",
    /\bwho referred\b|^referred by|\b(referr(al|er)|employee referral)\b.*\b(name|who)\b|\bname of (the )?(referrer|employee who referred)\b/,
  ],
  [
    "how_did_you_hear",
    /\b(how did you (hear|find|learn|come across)|where did you (hear|find|see)|source of (application|hire)|referral source|hear about (us|this))\b/,
  ],
  // Contact details.
  ["phone_country_code", /\b(country|dial(l?ing)?|isd) code\b/],
  ["email", /\be[ -]?mail\b/],
  ["phone", /\b(phone|mobile|cell|telephone|contact number|whatsapp)\b/],
  ["preferred_name", /\bpreferred( first)? name\b|\bnick ?name\b/],
  ["first_name", /\b(first|given|fore) ?name\b/],
  ["last_name", /\b(last|family|sur) ?name\b|\bsurname\b/],
  ["full_name", /^(full )?name$|\b(full|legal|your) name\b|\bcandidate name\b/],
  ["postal_code", /\b(postal|post|zip|pin) ?code\b|\bpincode\b|^zip$/],
  [
    "current_location",
    /\b(current|present) (location|city|address)\b|\bwhere are you (currently )?(based|located)\b|\blocation\b/,
  ],
  ["address_line", /\b(address|street)\b/],
  ["city", /\b(city|town)\b/],
  ["state", /\b(state|province|region)\b/],
  ["country", /\bcountry\b/],
  [
    "cover_letter_text",
    /\b(why (do you want|are you interested|this (role|company))|motivation|tell us (about yourself|why)|additional information)\b/,
  ],
];

const COUNTRY_SHORT: [RegExp, string][] = [
  [/\b(u s a?|usa|united states|america)\b/, "US"],
  [/\b(u k|uk|united kingdom|britain)\b/, "GB"],
  [/\b(u a e|uae)\b/, "AE"],
];

/** The country a work-authorization question is about, if it names one. */
export function questionCountry(q: string): string | undefined {
  for (const [pattern, code] of COUNTRY_SHORT) if (pattern.test(q)) return code;
  const tail = /\b(?:in|for) (?:the )?([a-z][a-z ]*)$/.exec(q)?.[1];
  return (tail ? parseCountries(tail)[0] : undefined) ?? parseCountries(q)[0];
}

const SKILL_YEARS = /\b(years?|yrs?|experience|exp)\b/;

/** The canonical key for a question, or "unknown". */
export function classifyField(field: Classifiable): string {
  const q = field.question;
  const auto = AUTOCOMPLETE[field.autocomplete?.split(/\s+/).pop() ?? ""];

  if (field.kind === "file") {
    return /cover ?letter/.test(q) ? "cover_letter_file" : "resume_file";
  }
  if (field.kind === "email") return "email";
  if (field.kind === "tel" && !/\bcode\b/.test(q)) return "phone";

  // "Years of experience with React" -> skill_years:react (but not total experience).
  if (SKILL_YEARS.test(q) && /\b(with|in|using|on|of)\b/.test(q)) {
    const skills = tagSkills(q.replace(/\b(experience|years?|total|overall|work)\b/g, " "));
    if (skills.length > 0 && !/\b(total|overall)\b/.test(q))
      return `skill_years:${skills[0] ?? ""}`;
  }

  for (const [key, pattern] of RULES) {
    if (key === "resume_file" || key === "cover_letter_file") continue;
    if (!pattern.test(q)) continue;
    if (key === "work_authorization") {
      const country = questionCountry(q);
      return country ? `work_authorization:${country}` : "work_authorization";
    }
    // "Cover letter" as a text box is the letter's text.
    return key;
  }
  if (/\bcover ?letter\b/.test(q)) return "cover_letter_text";
  if (auto) return auto;
  const fromName =
    field.name
      ?.toLowerCase()
      .replace(/[^a-z]+/g, " ")
      .trim() ?? "";
  if (fromName !== "" && fromName !== q) {
    for (const [key, pattern] of RULES) {
      if (key.endsWith("_file") || key === "work_authorization") continue;
      if (pattern.test(fromName)) return key;
    }
  }
  return "unknown";
}
