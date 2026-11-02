/** Profile helpers: experience totals, skill years, and turning drafts into profiles. */
import {
  ProfileSchema,
  parseCountries,
  skillDisplayName,
  tagSkills,
  type Experience,
  type Profile,
  type ProfileSkill,
  type Project,
} from "@job-copilot/shared";
import type { ExtractedContacts } from "../ai/redact";
import { skillIdFor, skillIdsFor } from "../ai/skillIds";
import type { ProfileDraft } from "../ai/tasks/extractProfile";

const isoNow = (now: Date) => now.toISOString().replace(/\.\d{3}Z$/, "Z");

export function emptyProfile(now: Date): Profile {
  return {
    id: "me",
    version: 0,
    basics: { fullName: "", email: "", phone: "", city: "", country: "", otherLinks: [] },
    summary: "",
    totalExperienceMonths: 0,
    skills: [],
    experience: [],
    education: [],
    projects: [],
    certifications: [],
    languages: [],
    achievements: [],
    updatedAt: isoNow(now),
  };
}

/** Month index (years * 12 + month) for "YYYY-MM". */
function monthIndex(yearMonth: string): number {
  const [y, m] = yearMonth.split("-").map(Number);
  return (y ?? 0) * 12 + ((m ?? 1) - 1);
}

function currentMonthIndex(now: Date): number {
  return now.getFullYear() * 12 + now.getMonth();
}

/** Total months worked, counting overlapping roles once (both end months included). */
export function totalExperienceMonths(
  experience: readonly Pick<Experience, "startDate" | "endDate">[],
  now: Date,
): number {
  const ranges = experience
    .map(
      (e) =>
        [
          monthIndex(e.startDate),
          e.endDate ? monthIndex(e.endDate) : currentMonthIndex(now),
        ] as const,
    )
    .filter(([s, e]) => e >= s)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let current: [number, number] | undefined;
  for (const [s, e] of ranges) {
    if (current && s <= current[1] + 1) {
      current[1] = Math.max(current[1], e);
    } else {
      if (current) total += current[1] - current[0] + 1;
      current = [s, e];
    }
  }
  if (current) total += current[1] - current[0] + 1;
  return total;
}

/** Skills mentioned in a role: its tagged skills plus skills found in title and bullets. */
export function roleSkills(role: Pick<Experience, "title" | "bullets" | "skills">): string[] {
  return [...new Set([...role.skills, ...tagSkills(`${role.title}\n${role.bullets.join("\n")}`)])];
}

/** Suggested years per skill from the roles that mention it (rounded to half years). */
export function suggestSkillYears(
  experience: readonly Experience[],
  now: Date,
): Map<string, number> {
  const bySkill = new Map<string, Experience[]>();
  for (const role of experience) {
    for (const id of roleSkills(role)) {
      const list = bySkill.get(id) ?? [];
      list.push(role);
      bySkill.set(id, list);
    }
  }
  const years = new Map<string, number>();
  for (const [id, roles] of bySkill) {
    years.set(id, Math.round((totalExperienceMonths(roles, now) / 12) * 2) / 2);
  }
  return years;
}

function newId(): string {
  return crypto.randomUUID();
}

function countryCode(name: string | undefined): string {
  if (!name) return "";
  if (/^[A-Za-z]{2}$/.test(name.trim())) return name.trim().toUpperCase();
  return parseCountries(name)[0] ?? "";
}

function httpUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * A profile built from the AI draft (or an empty draft when AI is off) plus the
 * contact details found locally. The user reviews it before it is saved.
 */
export function profileFromDraft(
  draft: ProfileDraft,
  contacts: ExtractedContacts,
  now: Date,
  base: Profile = emptyProfile(now),
): Profile {
  const experience: Experience[] = draft.experience.map((e) => ({
    id: newId(),
    company: e.company,
    title: e.title,
    ...(e.location && { location: e.location }),
    ...(e.employmentType && { employmentType: e.employmentType }),
    startDate: e.startDate,
    endDate: e.endDate,
    bullets: e.bullets,
    skills: skillIdsFor(tagSkills(`${e.title}\n${e.bullets.join("\n")}`)),
  }));
  const suggested = suggestSkillYears(experience, now);
  const skills: ProfileSkill[] = [];
  for (const s of draft.skills) {
    const id = skillIdFor(s.name);
    if (!id || skills.some((k) => k.id === id)) continue;
    const years = s.years ?? suggested.get(id);
    skills.push({
      id,
      displayName: skillDisplayName(id) === id ? s.name : skillDisplayName(id),
      ...(years !== undefined && { years }),
      ...(s.level && { level: s.level }),
      source: "resume",
    });
  }
  const projects: Project[] = draft.projects.map((p) => {
    const repo = httpUrl(p.repoUrl);
    const live = httpUrl(p.liveUrl);
    return {
      id: newId(),
      name: p.name,
      description: p.description,
      bullets: p.bullets,
      techStack: skillIdsFor(p.techStack),
      links: { ...(repo && { repo }), ...(live && { live }) },
      source: "resume",
      included: true,
      highlight: false,
      updatedAt: isoNow(now),
    };
  });
  const linkedinUrl = contacts.linkedinUrl ?? base.basics.linkedinUrl;
  const portfolioUrl = httpUrl(contacts.portfolioUrls[0]) ?? base.basics.portfolioUrl;
  const githubUsername = contacts.githubUsername ?? base.basics.githubUsername;
  const profile: Profile = {
    ...base,
    basics: {
      ...base.basics,
      email: contacts.emails[0] ?? base.basics.email,
      phone: contacts.phones[0] ?? base.basics.phone,
      city: draft.city ?? base.basics.city,
      ...(draft.state && { state: draft.state }),
      country: countryCode(draft.country) || base.basics.country,
      ...(linkedinUrl && { linkedinUrl }),
      ...(portfolioUrl && { portfolioUrl }),
      ...(githubUsername && { githubUsername }),
    },
    ...(draft.headline && { headline: draft.headline }),
    summary: draft.summary,
    skills,
    experience,
    totalExperienceMonths: totalExperienceMonths(experience, now),
    education: draft.education.map((e) => ({ id: newId(), ...e })),
    projects,
    certifications: draft.certifications.map((c) => ({ id: newId(), ...c })),
    languages: draft.languages,
    achievements: draft.achievements,
    updatedAt: isoNow(now),
  };
  return ProfileSchema.parse(profile);
}

/** Saving always bumps the version so scores computed for the old profile are redone. */
export function nextVersion(profile: Profile, now: Date): Profile {
  return { ...profile, version: profile.version + 1, updatedAt: isoNow(now) };
}
