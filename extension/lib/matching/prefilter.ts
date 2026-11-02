/**
 * Stage 1 matching (spec 12.1): hard filters from the preferences, then a local
 * score from skills, title and experience. Free and instant; runs for every job.
 */
import {
  LOCATIONS,
  containsPhrase,
  normalizeCompanyName,
  normalizeForMatching,
  skillDisplayName,
  tagSkills,
  withImpliedSkills,
  type Job,
  type JobType,
  type Preferences,
  type PrefilterResult,
  type Profile,
} from "@job-copilot/shared";

export const WEIGHTS = { skills: 0.6, title: 0.2, experience: 0.2 } as const;
/** Only the first job skills count (title skills first). */
export const MAX_JOB_SKILLS = 12;
/** Skills named in the job title count this many times. */
export const TITLE_SKILL_WEIGHT = 2;
/** Title score when the user has not named any desired roles yet. */
export const NO_ROLES_TITLE_SCORE = 0.5;
export const EXPERIENCE_FIT = {
  fit: 1,
  nearlyEnough: 0.5,
  tooLittle: 0,
  notStated: 0.7,
  over: 0.5,
};

export interface MatchProfile {
  /** Profile skills plus the skills they imply. */
  skills: ReadonlySet<string>;
  totalYears: number;
  desiredRoles: readonly string[];
}

export function matchProfile(profile: Profile, preferences: Preferences): MatchProfile {
  return {
    skills: withImpliedSkills(profile.skills.map((s) => s.id)),
    totalYears: profile.totalExperienceMonths / 12,
    desiredRoles: preferences.desiredRoles,
  };
}

// ---------------------------------------------------------------- hard filters

/** The job type from an ATS employment type ("Full-time", "FullTime", "Contract") or the title. */
export function jobTypeOf(job: Pick<Job, "employmentType" | "title">): JobType | undefined {
  const type = (job.employmentType ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (type.includes("intern") || /\bintern(ship)?s?\b/i.test(job.title)) return "internship";
  if (/contract|freelance|temporary|temp\b/.test(type)) return "contract";
  if (type.startsWith("part")) return "part_time";
  if (/full|permanent|regular/.test(type)) return "full_time";
  return undefined;
}

const cityNames = new Map<string, readonly string[]>();
for (const city of LOCATIONS.cities) {
  const names = city.names.map(normalizeForMatching);
  for (const name of names) cityNames.set(name, names);
}

/** True when a job location names the preferred city (or one of its other names). */
export function locationMatches(jobLocation: string, preferredCity: string): boolean {
  const city = normalizeForMatching(preferredCity);
  if (city === "") return false;
  const text = normalizeForMatching(jobLocation);
  return (cityNames.get(city) ?? [city]).some((name) => containsPhrase(text, name));
}

/** The reason a job is excluded by the preferences, or undefined when it stays (spec 12.1). */
export function exclusionReason(job: Job, preferences: Preferences): string | undefined {
  if (job.status === "closed" || job.closedAt) return "Closed";

  const company = normalizeCompanyName(job.company.name);
  if (preferences.hiddenCompanies.some((c) => normalizeCompanyName(c) === company)) {
    return "Hidden company";
  }

  const title = normalizeForMatching(job.title);
  const keyword = preferences.excludeTitleKeywords.find((k) => {
    const word = normalizeForMatching(k);
    return word !== "" && containsPhrase(title, word);
  });
  if (keyword) return `Title contains “${keyword}”`;

  const type = jobTypeOf(job);
  if (type && preferences.jobTypes.length > 0 && !preferences.jobTypes.includes(type)) {
    return "Job type you did not choose";
  }

  if (
    preferences.countries.length > 0 &&
    job.countryCodes.length > 0 &&
    !job.countryCodes.some((c) => preferences.countries.includes(c))
  ) {
    return "Country you did not choose";
  }

  if (
    preferences.remotePreference === "remote" &&
    (job.remote === "onsite" || job.remote === "hybrid")
  ) {
    return "Not remote";
  }

  // Office and hybrid jobs must be in a preferred city, unless the user would relocate.
  if (
    preferences.preferredLocations.length > 0 &&
    !preferences.willingToRelocate &&
    (job.remote === "onsite" || job.remote === "hybrid") &&
    job.locations.length > 0 &&
    !job.locations.some((l) => preferences.preferredLocations.some((c) => locationMatches(l, c)))
  ) {
    return "Not in your cities";
  }
  return undefined;
}

// ---------------------------------------------------------------- score

const TITLE_SYNONYMS: [RegExp, string][] = [
  [/\bfront[\s-]?end\b/g, "frontend"],
  [/\bback[\s-]?end\b/g, "backend"],
  [/\bfull[\s-]?stack\b/g, "fullstack"],
  [/\bengineers?\b/g, "developer"],
  [/\bdevelopers?\b/g, "developer"],
  [/\bdev\b/g, "developer"],
  [/\bprogrammers?\b/g, "developer"],
  [/\bsde\b/g, "developer"],
  [/\bswe\b/g, "software developer"],
  [/\bsr\b/g, "senior"],
  [/\bjr\b/g, "junior"],
];

/** Lowercase title words with spelling variants unified ("Front-End Engineer" -> frontend developer). */
export function titleTokens(title: string): Set<string> {
  let text = normalizeForMatching(title).replace(/[^a-z0-9+#.]+/g, " ");
  for (const [pattern, replacement] of TITLE_SYNONYMS) text = text.replace(pattern, replacement);
  return new Set(text.split(" ").filter((t) => t.length > 0));
}

/** Best share of a desired role's words found in the job title (0..1). */
export function titleMatch(jobTitle: string, desiredRoles: readonly string[]): number {
  if (desiredRoles.length === 0) return NO_ROLES_TITLE_SCORE;
  const title = titleTokens(jobTitle);
  let best = 0;
  for (const role of desiredRoles) {
    const words = titleTokens(role);
    if (words.size === 0) continue;
    let hits = 0;
    for (const w of words) if (title.has(w)) hits++;
    best = Math.max(best, hits / words.size);
  }
  return best;
}

export function experienceFit(totalYears: number, min?: number, max?: number): number {
  if (min === undefined && max === undefined) return EXPERIENCE_FIT.notStated;
  const low = min ?? 0;
  const high = max ?? Number.POSITIVE_INFINITY;
  if (totalYears >= low && totalYears <= high + 1) return EXPERIENCE_FIT.fit;
  if (totalYears < low) {
    return totalYears >= low - 1 ? EXPERIENCE_FIT.nearlyEnough : EXPERIENCE_FIT.tooLittle;
  }
  return EXPERIENCE_FIT.over;
}

/** The job skills that count: title skills first, then the rest, at most 12. */
export function countedJobSkills(job: Pick<Job, "title" | "skills">): {
  skills: string[];
  inTitle: Set<string>;
} {
  const inTitle = new Set(tagSkills(job.title).filter((s) => job.skills.includes(s)));
  const ordered = [...inTitle, ...job.skills.filter((s) => !inTitle.has(s))];
  return { skills: ordered.slice(0, MAX_JOB_SKILLS), inTitle };
}

function names(ids: readonly string[], max = 3): string {
  return ids.slice(0, max).map(skillDisplayName).join(", ");
}

function yearsText(min?: number, max?: number): string {
  if (min !== undefined && max !== undefined) return `${String(min)}-${String(max)} years`;
  if (min !== undefined) return `${String(min)}+ years`;
  return `up to ${String(max)} years`;
}

/** Prefilter result for one job (spec 12.1). */
export function prefilterJob(
  job: Job,
  me: MatchProfile,
  preferences: Preferences,
  minScore: number,
): PrefilterResult {
  const { skills, inTitle } = countedJobSkills(job);
  const matched = skills.filter((s) => me.skills.has(s));
  const missing = skills.filter((s) => !me.skills.has(s));
  const weight = (s: string) => (inTitle.has(s) ? TITLE_SKILL_WEIGHT : 1);
  const total = skills.reduce((sum, s) => sum + weight(s), 0);
  const skillCoverage = matched.reduce((sum, s) => sum + weight(s), 0) / Math.max(1, total);
  const title = titleMatch(job.title, me.desiredRoles);
  const experience = experienceFit(me.totalYears, job.experienceMin, job.experienceMax);
  const score = Math.round(
    100 *
      (WEIGHTS.skills * skillCoverage + WEIGHTS.title * title + WEIGHTS.experience * experience),
  );

  const reasons: string[] = [];
  if (matched.length > 0) reasons.push(`Matches ${names(matched)}`);
  if (missing.length > 0) reasons.push(`Missing ${names(missing)}`);
  if (title === 1 && me.desiredRoles.length > 0) reasons.push("Title matches a role you want");
  if (job.experienceMin !== undefined || job.experienceMax !== undefined) {
    const years = Math.floor(me.totalYears);
    if (experience === EXPERIENCE_FIT.fit) {
      reasons.push(
        `Asks for ${yearsText(job.experienceMin, job.experienceMax)}; you have ${String(years)}`,
      );
    } else if (experience < EXPERIENCE_FIT.fit) {
      const what = me.totalYears < (job.experienceMin ?? 0) ? "fewer" : "more";
      reasons.push(
        `Asks for ${yearsText(job.experienceMin, job.experienceMax)}; you have ${what} (${String(years)})`,
      );
    }
  }

  const excluded = exclusionReason(job, preferences);
  return {
    score,
    matchedSkills: matched,
    missingSkills: missing,
    passed: excluded === undefined && score >= minScore,
    reasons,
    ...(excluded && { excluded }),
  };
}
