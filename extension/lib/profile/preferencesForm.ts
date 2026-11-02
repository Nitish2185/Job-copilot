/**
 * Preferences <-> form values (onboarding steps 6 and 7). CTC fields accept
 * "12 LPA", "12.5 lakh" or "1200000" and show back as "12 LPA".
 */
import { PreferencesSchema, formatCtc, parseCtc, type Preferences } from "@job-copilot/shared";

type Status = Preferences["workAuthorization"][number]["status"];

export interface PreferencesFormValues {
  workAuthorization: { countryCode: string; status: Status; note: string }[];
  needsSponsorship: boolean;
  noticePeriodDays: string;
  noticeNegotiable: boolean;
  servingNotice: boolean;
  lastWorkingDay: string;
  currentCtc: string;
  expectedCtcMin: string;
  expectedCtcMax: string;
  salaryDisclosure: Preferences["salaryDisclosure"];
  willingToRelocate: boolean;
  earliestStartDate: string;
  dateOfBirth: string;
  howDidYouHearDefault: string;
  eeo: {
    gender: string;
    raceEthnicity: string;
    hispanicLatino: string;
    veteranStatus: string;
    disabilityStatus: string;
    pronouns: string;
  };
  desiredRoles: string;
  experienceLevel: Preferences["experienceLevel"];
  jobTypes: Preferences["jobTypes"];
  countries: string;
  preferredLocations: string;
  remotePreference: Preferences["remotePreference"];
  minSalary: string;
  excludeTitleKeywords: string;
  hiddenCompanies: string;
}

const list = (text: string) =>
  text
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t !== "");

const opt = (text: string) => (text.trim() === "" ? undefined : text.trim());

export function preferencesToForm(p: Preferences): PreferencesFormValues {
  return {
    workAuthorization: p.workAuthorization.map((w) => ({
      countryCode: w.countryCode,
      status: w.status,
      note: w.note ?? "",
    })),
    needsSponsorship: p.needsSponsorship,
    noticePeriodDays: String(p.noticePeriodDays),
    noticeNegotiable: p.noticeNegotiable,
    servingNotice: p.servingNotice !== undefined,
    lastWorkingDay: p.servingNotice?.lastWorkingDay ?? "",
    currentCtc: p.currentCtc ? formatCtc(p.currentCtc) : "",
    expectedCtcMin: p.expectedCtc
      ? formatCtc({
          amount: p.expectedCtc.min,
          currency: p.expectedCtc.currency,
          period: p.expectedCtc.period,
        })
      : "",
    expectedCtcMax:
      p.expectedCtc?.max !== undefined
        ? formatCtc({
            amount: p.expectedCtc.max,
            currency: p.expectedCtc.currency,
            period: p.expectedCtc.period,
          })
        : "",
    salaryDisclosure: p.salaryDisclosure,
    willingToRelocate: p.willingToRelocate,
    earliestStartDate: p.earliestStartDate ?? "",
    dateOfBirth: p.dateOfBirth ?? "",
    howDidYouHearDefault: p.howDidYouHearDefault ?? "",
    eeo: {
      gender: p.eeo?.gender ?? "",
      raceEthnicity: p.eeo?.raceEthnicity ?? "",
      hispanicLatino: p.eeo?.hispanicLatino ?? "",
      veteranStatus: p.eeo?.veteranStatus ?? "",
      disabilityStatus: p.eeo?.disabilityStatus ?? "",
      pronouns: p.eeo?.pronouns ?? "",
    },
    desiredRoles: p.desiredRoles.join(", "),
    experienceLevel: p.experienceLevel,
    jobTypes: p.jobTypes,
    countries: p.countries.join(", "),
    preferredLocations: p.preferredLocations.join(", "),
    remotePreference: p.remotePreference,
    minSalary: p.minSalary ? formatCtc(p.minSalary) : "",
    excludeTitleKeywords: p.excludeTitleKeywords.join(", "),
    hiddenCompanies: p.hiddenCompanies.join(", "),
  };
}

export type PreferencesResult =
  { ok: true; preferences: Preferences } | { ok: false; issues: string[] };

/** Builds preferences from the form. `currency` is the default for CTC fields (INR for India). */
export function formToPreferences(v: PreferencesFormValues, currency: string): PreferencesResult {
  const issues: string[] = [];
  const ctc = (label: string, text: string) => {
    if (text.trim() === "") return undefined;
    const parsed = parseCtc(text, currency);
    if (!parsed) issues.push(`${label}: write an amount such as "12 LPA" or "1200000"`);
    return parsed ?? undefined;
  };
  const current = ctc("Current CTC", v.currentCtc);
  const expectedMin = ctc("Expected CTC", v.expectedCtcMin);
  const expectedMax = ctc("Expected CTC (maximum)", v.expectedCtcMax);
  const minSalary = ctc("Minimum salary", v.minSalary);
  const notice = Number(v.noticePeriodDays);
  if (!Number.isInteger(notice) || notice < 0) issues.push("Notice period: write a number of days");
  const eeo = Object.fromEntries(Object.entries(v.eeo).filter(([, value]) => value.trim() !== ""));

  const candidate: Preferences = {
    workAuthorization: v.workAuthorization
      .filter((w) => w.countryCode.trim() !== "")
      .map((w) => ({
        countryCode: w.countryCode.trim().toUpperCase(),
        status: w.status,
        ...(opt(w.note) && { note: opt(w.note) }),
      })),
    needsSponsorship: v.needsSponsorship,
    noticePeriodDays: Number.isInteger(notice) && notice >= 0 ? notice : 0,
    noticeNegotiable: v.noticeNegotiable,
    ...(v.servingNotice && {
      servingNotice: opt(v.lastWorkingDay) ? { lastWorkingDay: v.lastWorkingDay.trim() } : {},
    }),
    ...(current && { currentCtc: current }),
    ...(expectedMin && {
      expectedCtc: {
        min: expectedMin.amount,
        ...(expectedMax && { max: expectedMax.amount }),
        currency: expectedMin.currency,
        period: expectedMin.period,
      },
    }),
    salaryDisclosure: v.salaryDisclosure,
    preferredLocations: list(v.preferredLocations),
    remotePreference: v.remotePreference,
    willingToRelocate: v.willingToRelocate,
    ...(opt(v.earliestStartDate) && { earliestStartDate: v.earliestStartDate.trim() }),
    desiredRoles: list(v.desiredRoles),
    experienceLevel: v.experienceLevel,
    jobTypes: v.jobTypes,
    countries: list(v.countries).map((c) => c.toUpperCase()),
    excludeTitleKeywords: list(v.excludeTitleKeywords),
    hiddenCompanies: list(v.hiddenCompanies),
    ...(minSalary && { minSalary }),
    ...(Object.keys(eeo).length > 0 && { eeo }),
    ...(opt(v.dateOfBirth) && { dateOfBirth: v.dateOfBirth.trim() }),
    ...(opt(v.howDidYouHearDefault) && { howDidYouHearDefault: v.howDidYouHearDefault.trim() }),
  };
  if (issues.length > 0) return { ok: false, issues };
  const parsed = PreferencesSchema.safeParse(candidate);
  if (parsed.success) return { ok: true, preferences: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues.map((i) => {
      const field = i.path.map(String).join(" ");
      if (field.startsWith("countries") || field.includes("countryCode"))
        return "Countries: use 2-letter codes such as IN, US";
      if (field.startsWith("expectedCtc"))
        return "Expected CTC: the maximum must not be below the minimum";
      return `Check ${field}`;
    }),
  };
}
