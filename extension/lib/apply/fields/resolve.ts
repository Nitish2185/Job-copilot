/**
 * Value resolution (spec 16.3): 1. profile and preferences, 2. answer bank,
 * 3. sensitive questions stop ("Needs you"), 4. diversity questions use the
 * saved answer or "decline", 5. other questions may ask the AI, 6. unknown
 * optional fields stay empty and unknown required ones need the user.
 */
import {
  formatCtc,
  type AnswerBankEntry,
  type FieldType,
  type Preferences,
  type Profile,
} from "@job-copilot/shared";
import { findAnswer } from "../../answers/answerBank";
import { locationLine } from "../../resume/document";
import { suggestSkillYears } from "../../profile/profile";
import type { FieldKind, FormField } from "./discover";
import {
  countryOption,
  declineOption,
  rangeOption,
  splitPhone,
  textOption,
  yesNoOption,
} from "./options";
import { EEO_KEYS, isSensitiveKey } from "./rules";

export type ValueSource = "profile" | "preferences" | "answer_bank" | "ai" | "decline";

export type FillValue =
  | { kind: "text"; text: string }
  | { kind: "option"; option: string }
  | { kind: "options"; options: string[] }
  | { kind: "check"; checked: boolean };

export type NeedsYouReason =
  | "missing_sensitive_answer"
  | "unknown_required_question"
  | "consent_required"
  | "no_matching_option";

export type Resolution =
  | { status: "fill"; value: FillValue; source: ValueSource }
  | { status: "file"; which: "resume" | "cover_letter" }
  | { status: "needs_you"; reason: NeedsYouReason; note: string }
  | { status: "ask_ai" }
  | { status: "skip" };

export interface ResolveContext {
  profile: Profile;
  /** Undefined until the user saved the "ask once" answers. */
  preferences?: Preferences;
  answers: readonly AnswerBankEntry[];
  mode: "auto" | "assist";
  allowPrivacyAcknowledgement: boolean;
  coverLetterText?: string;
  /** Country of the job, for "Are you authorized to work in this country?". */
  jobCountry?: string;
  /** Every key found on this form step (to split years and months, phone and code). */
  formKeys: ReadonlySet<string>;
  now: Date;
}

/** An answer before it is shaped for the field. */
type Answer =
  | { type: "text"; text: string }
  | { type: "bool"; value: boolean }
  | { type: "number"; value: number; unit?: "days" | "years" | "lakhs"; text: string }
  | { type: "country"; code: string; text: string }
  | { type: "date"; iso: string; text: string };

const text = (t: string | undefined): Answer | undefined =>
  t && t.trim() !== "" ? { type: "text", text: t.trim() } : undefined;

function trimNumber(n: number, digits = 1): string {
  return String(Number(n.toFixed(digits)));
}

function addDays(date: Date, days: number): string {
  return new Date(date.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

const COUNTRY_DIAL: Record<string, string> = {
  IN: "+91",
  US: "+1",
  CA: "+1",
  GB: "+44",
  AU: "+61",
  SG: "+65",
  AE: "+971",
  DE: "+49",
};

function currentRole(profile: Profile) {
  return (
    profile.experience.find((e) => e.endDate === null) ??
    [...profile.experience].sort((a, b) => (b.endDate ?? "").localeCompare(a.endDate ?? ""))[0]
  );
}

function latestEducation(profile: Profile) {
  return [...profile.education].sort((a, b) => (b.endYear ?? 0) - (a.endYear ?? 0))[0];
}

/** Pay as the field expects it: lakhs when the label says LPA/lakhs, else the full amount. */
function payAnswer(
  amount: number,
  currency: string,
  period: "year" | "month",
  label: string,
): Answer {
  const inLakhs = /\b(lpa|lakhs?|lacs?|lac)\b/i.test(label);
  if (currency === "INR" && period === "year") {
    const lakhs = amount / 100_000;
    return {
      type: "number",
      value: lakhs,
      unit: "lakhs",
      text: inLakhs
        ? trimNumber(lakhs, 2)
        : /\bctc\b/i.test(label)
          ? formatCtc({ amount, currency, period })
          : String(amount),
    };
  }
  return {
    type: "number",
    value: amount,
    text: inLakhs ? trimNumber(amount / 100_000, 2) : String(amount),
  };
}

const WORK_STATUS_TEXT: Record<string, string[]> = {
  citizen: ["citizen"],
  permanent_resident: ["permanent resident", "green card"],
  work_visa: ["work visa", "visa"],
  needs_sponsorship: ["require sponsorship", "need sponsorship"],
};

/** The deterministic answer from the profile and preferences (step 1). */
function profileAnswer(key: string, field: FormField, ctx: ResolveContext): Answer | undefined {
  const { profile, preferences: prefs } = ctx;
  const b = profile.basics;
  const names = b.fullName.trim().split(/\s+/);
  const years = profile.totalExperienceMonths / 12;
  const role = currentRole(profile);
  const school = latestEducation(profile);

  switch (key) {
    case "first_name":
    case "preferred_name":
      return text(names[0]);
    case "last_name":
      return names.length > 1 ? text(names[names.length - 1]) : undefined;
    case "full_name":
      return text(b.fullName);
    case "email":
      return text(b.email);
    case "phone": {
      if (b.phone.trim() === "") return undefined;
      const split = splitPhone(b.phone);
      return text(ctx.formKeys.has("phone_country_code") ? split.national : b.phone);
    }
    case "phone_country_code": {
      const code = splitPhone(b.phone).countryCode ?? COUNTRY_DIAL[b.country];
      return text(code);
    }
    case "city":
      return text(b.city);
    case "state":
      return text(b.state);
    case "country":
      return b.country
        ? { type: "country", code: b.country, text: locationLine({ ...b, city: "", state: "" }) }
        : undefined;
    case "current_location":
      return text(locationLine(b));
    case "linkedin":
      return text(b.linkedinUrl);
    case "github":
      return b.githubUsername ? text(`https://github.com/${b.githubUsername}`) : undefined;
    case "portfolio":
    case "website":
      return text(b.portfolioUrl ?? b.otherLinks[0]?.url);
    case "twitter":
      return text(b.otherLinks.find((l) => /twitter|\bx\b/i.test(l.label))?.url);
    case "current_company":
      return text(role?.company);
    case "current_title":
      return text(role?.title ?? profile.headline);
    case "total_experience_years": {
      const split = ctx.formKeys.has("total_experience_months");
      const value = split ? Math.floor(years) : years;
      return {
        type: "number",
        value,
        unit: "years",
        text: split ? String(Math.floor(years)) : trimNumber(years),
      };
    }
    case "total_experience_months": {
      const months = ctx.formKeys.has("total_experience_years")
        ? profile.totalExperienceMonths % 12
        : profile.totalExperienceMonths;
      return { type: "number", value: months, text: String(months) };
    }
    case "education_degree":
      return text(school ? [school.degree, school.field].filter(Boolean).join(", ") : undefined);
    case "education_institution":
      return text(school?.institution);
    case "graduation_year":
      return school?.endYear
        ? { type: "number", value: school.endYear, text: String(school.endYear) }
        : undefined;
    case "gpa":
      return text(school?.grade);
    case "cover_letter_text":
      return text(ctx.coverLetterText);
  }

  if (key.startsWith("skill_years:")) {
    const id = key.slice("skill_years:".length);
    const value =
      profile.skills.find((s) => s.id === id)?.years ??
      suggestSkillYears(profile.experience, ctx.now).get(id);
    return value === undefined
      ? undefined
      : { type: "number", value, unit: "years", text: trimNumber(value) };
  }

  // Everything below comes from the "ask once" answers; nothing is guessed without them.
  if (!prefs) return undefined;
  switch (key) {
    case "notice_period": {
      const days = prefs.noticePeriodDays;
      const label = field.label.toLowerCase();
      const asText = label.includes("month")
        ? trimNumber(days / 30)
        : label.includes("day") || field.kind === "number"
          ? String(days)
          : days === 0
            ? "Immediate"
            : `${String(days)} days`;
      if (label.includes("immediate")) return { type: "bool", value: days <= 15 };
      return { type: "number", value: days, unit: "days", text: asText };
    }
    case "serving_notice":
      return { type: "bool", value: prefs.servingNotice !== undefined };
    case "last_working_day": {
      const day = prefs.servingNotice?.lastWorkingDay;
      return day ? { type: "date", iso: day, text: day } : undefined;
    }
    case "current_ctc":
    case "expected_ctc":
    case "salary_expectation": {
      // The user chose to answer pay questions themselves each time.
      if (prefs.salaryDisclosure === "ask_each_time") return undefined;
      const pay =
        key === "current_ctc"
          ? prefs.currentCtc
          : prefs.expectedCtc && {
              amount: prefs.expectedCtc.min,
              currency: prefs.expectedCtc.currency,
              period: prefs.expectedCtc.period,
            };
      return pay ? payAnswer(pay.amount, pay.currency, pay.period, field.label) : undefined;
    }
    case "salary_currency":
      return text(prefs.expectedCtc?.currency ?? prefs.currentCtc?.currency);
    case "sponsorship":
      return { type: "bool", value: prefs.needsSponsorship };
    case "relocate":
      return { type: "bool", value: prefs.willingToRelocate };
    case "willing_onsite":
    case "willing_hybrid":
      return { type: "bool", value: prefs.remotePreference !== "remote" };
    case "start_date": {
      const iso = prefs.earliestStartDate ?? addDays(ctx.now, prefs.noticePeriodDays);
      return { type: "date", iso, text: iso };
    }
    case "date_of_birth":
      return prefs.dateOfBirth
        ? { type: "date", iso: prefs.dateOfBirth, text: prefs.dateOfBirth }
        : undefined;
    case "how_did_you_hear":
      return text(prefs.howDidYouHearDefault);
  }

  if (key.startsWith("work_authorization")) {
    const country = key.split(":")[1] ?? ctx.jobCountry ?? b.country;
    const entry = prefs.workAuthorization.find((w) => w.countryCode === country);
    if (!entry || entry.status === "other") return undefined;
    if (field.options.length > 0 && !field.options.some((o) => /^(yes|no)\b/i.test(o))) {
      const phrases = WORK_STATUS_TEXT[entry.status] ?? [];
      const match = phrases
        .map((p) => field.options.find((o) => o.toLowerCase().includes(p)))
        .find(Boolean);
      if (match) return { type: "text", text: match };
    }
    return { type: "bool", value: entry.status !== "needs_sponsorship" };
  }
  return undefined;
}

const OPTION_KINDS = new Set<FieldKind>(["select", "radio", "checkbox_group"]);

/** Shapes an answer for the field; undefined when no option fits. */
function fit(field: FormField, answer: Answer): FillValue | undefined {
  const hasOptions =
    OPTION_KINDS.has(field.kind) || (field.kind === "combobox" && field.options.length > 0);
  if (field.kind === "checkbox") {
    return answer.type === "bool" ? { kind: "check", checked: answer.value } : undefined;
  }
  if (hasOptions) {
    const o = field.options;
    let option: string | undefined;
    if (answer.type === "bool") option = yesNoOption(o, answer.value);
    else if (answer.type === "number") {
      option = answer.unit ? rangeOption(o, answer.value, answer.unit) : undefined;
      option ??= textOption(o, answer.text) ?? textOption(o, String(answer.value));
    } else if (answer.type === "country") option = countryOption(o, answer.code);
    else option = textOption(o, answer.text);
    if (!option) return undefined;
    return field.kind === "checkbox_group"
      ? { kind: "options", options: [option] }
      : { kind: "option", option };
  }
  if (field.kind === "date") {
    if (answer.type !== "date") return undefined;
    return {
      kind: "text",
      text: field.element.getAttribute("type") === "month" ? answer.iso.slice(0, 7) : answer.iso,
    };
  }
  if (field.kind === "number") {
    if (answer.type !== "number") return undefined;
    return { kind: "text", text: answer.text.replace(/[^\d.]/g, "") || String(answer.value) };
  }
  const value = answer.type === "bool" ? (answer.value ? "Yes" : "No") : answer.text;
  return { kind: "text", text: field.maxLength ? value.slice(0, field.maxLength) : value };
}

function fieldType(kind: FieldKind): FieldType {
  switch (kind) {
    case "select":
    case "combobox":
      return "select";
    case "radio":
      return "radio";
    case "checkbox":
    case "checkbox_group":
      return "checkbox";
    case "number":
      return "number";
    case "date":
      return "date";
    case "textarea":
      return "textarea";
    default:
      return "text";
  }
}

/** Shapes a saved answer for the field (the bank already checked type and options). */
function fromBank(field: FormField, entry: AnswerBankEntry): FillValue | undefined {
  const a = entry.answer;
  if (typeof a === "boolean") return fit(field, { type: "bool", value: a });
  if (Array.isArray(a))
    return field.kind === "checkbox_group" ? { kind: "options", options: a } : undefined;
  const s = String(a);
  if (OPTION_KINDS.has(field.kind) || (field.kind === "combobox" && field.options.length > 0)) {
    const option = textOption(field.options, s);
    if (!option) return undefined;
    return field.kind === "checkbox_group"
      ? { kind: "options", options: [option] }
      : { kind: "option", option };
  }
  return { kind: "text", text: field.maxLength ? s.slice(0, field.maxLength) : s };
}

const CONSENT_KEYS = new Set([
  "privacy_acknowledgement",
  "background_check_consent",
  "legal_attestation",
]);

export async function resolveField(
  field: FormField,
  key: string,
  ctx: ResolveContext,
): Promise<Resolution> {
  // Files are attached by the engine.
  if (key === "resume_file") return { status: "file", which: "resume" };
  if (key === "cover_letter_file") {
    return ctx.coverLetterText || field.required
      ? { status: "file", which: "cover_letter" }
      : { status: "skip" };
  }

  // Consent: only the standard privacy acknowledgement on Auto sites, when allowed (spec 2.3).
  if (key === "privacy_acknowledgement" && ctx.mode === "auto" && ctx.allowPrivacyAcknowledgement) {
    const value = fit(field, { type: "bool", value: true });
    if (value) return { status: "fill", value, source: "preferences" };
  }

  // 1. Profile and preferences.
  if (!CONSENT_KEYS.has(key) && !EEO_KEYS.has(key)) {
    const answer = profileAnswer(key, field, ctx);
    if (answer) {
      const value = fit(field, answer);
      if (value) {
        const source =
          isSensitiveKey(key) ||
          [
            "how_did_you_hear",
            "start_date",
            "willing_onsite",
            "willing_hybrid",
            "salary_currency",
          ].includes(key)
            ? "preferences"
            : "profile";
        return { status: "fill", value, source };
      }
    }
  }

  // 2. Answer bank.
  const entry = await findAnswer(
    ctx.answers,
    field.label,
    fieldType(field.kind),
    field.options.length > 0 ? field.options : undefined,
  );
  if (entry) {
    const value = fromBank(field, entry);
    if (value) return { status: "fill", value, source: "answer_bank" };
  }

  // 3. Sensitive questions and consents never go further.
  if (CONSENT_KEYS.has(key)) {
    return { status: "needs_you", reason: "consent_required", note: "Only you can agree to this." };
  }
  if (isSensitiveKey(key)) {
    const askEachTime =
      ctx.preferences?.salaryDisclosure === "ask_each_time" &&
      ["current_ctc", "expected_ctc", "salary_expectation"].includes(key);
    return {
      status: "needs_you",
      reason: "missing_sensitive_answer",
      note: askEachTime
        ? "You chose to answer salary questions yourself."
        : "Job Copilot only uses your own answer here. Add it in your profile or saved answers.",
    };
  }

  // 4. Voluntary diversity questions: the saved answer, else "decline".
  if (EEO_KEYS.has(key)) {
    const eeoKey =
      (
        {
          race_ethnicity: "raceEthnicity",
          hispanic_latino: "hispanicLatino",
          veteran_status: "veteranStatus",
          disability_status: "disabilityStatus",
        } as Record<string, string>
      )[key] ?? key;
    const saved = (ctx.preferences?.eeo as Record<string, string | undefined> | undefined)?.[
      eeoKey
    ];
    if (saved) {
      const value = fit(field, { type: "text", text: saved });
      if (value) return { status: "fill", value, source: "preferences" };
    }
    const decline = declineOption(field.options);
    if (decline) {
      return {
        status: "fill",
        value:
          field.kind === "checkbox_group"
            ? { kind: "options", options: [decline] }
            : { kind: "option", option: decline },
        source: "decline",
      };
    }
    if (!field.required) return { status: "skip" };
    return {
      status: "needs_you",
      reason: "no_matching_option",
      note: "No “decline to answer” choice here.",
    };
  }

  // 5. Known keys without a value, and unknown questions: the AI may help with text-like answers.
  if (key === "unknown" && field.kind !== "file") return { status: "ask_ai" };

  // 6. Nothing to say.
  if (!field.required) return { status: "skip" };
  return {
    status: "needs_you",
    reason: "unknown_required_question",
    note: "This required question is not in your profile yet.",
  };
}
