/**
 * Profile <-> editor form values. The form uses plain strings (one bullet per
 * line, skills by name) so it is easy to edit; saving maps back to canonical
 * skill IDs and validates with ProfileSchema.
 */
import { ProfileSchema, skillDisplayName, type Profile, type Project } from "@job-copilot/shared";
import type { z } from "zod";
import { skillIdFor, skillIdsFor } from "../ai/skillIds";
import { totalExperienceMonths } from "./profile";

type Level = "beginner" | "intermediate" | "advanced" | "expert";

export interface ProfileFormValues {
  fullName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  country: string;
  linkedinUrl: string;
  githubUsername: string;
  portfolioUrl: string;
  headline: string;
  summary: string;
  /** Empty means "compute from experience". */
  totalExperienceYears: string;
  skills: { name: string; years: string; level: "" | Level }[];
  experience: {
    id: string;
    company: string;
    title: string;
    location: string;
    startDate: string;
    endDate: string;
    current: boolean;
    bullets: string;
  }[];
  education: {
    id: string;
    institution: string;
    degree: string;
    field: string;
    startYear: string;
    endYear: string;
    grade: string;
  }[];
  projects: {
    id: string;
    name: string;
    description: string;
    bullets: string;
    techStack: string;
    repo: string;
    live: string;
    included: boolean;
    highlight: boolean;
  }[];
  certifications: { id: string; name: string; issuer: string; year: string }[];
  languages: { name: string; proficiency: string }[];
  achievements: string;
}

const lines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.replace(/^\s*[-•*]\s*/, "").trim())
    .filter((l) => l !== "");

const opt = (value: string) => (value.trim() === "" ? undefined : value.trim());

const year = (value: string) => {
  const n = Number(value);
  return value.trim() !== "" && Number.isInteger(n) ? n : undefined;
};

function withHttp(value: string): string | undefined {
  const v = value.trim();
  if (v === "") return undefined;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

export function profileToForm(profile: Profile): ProfileFormValues {
  const b = profile.basics;
  return {
    fullName: b.fullName,
    email: b.email,
    phone: b.phone,
    city: b.city,
    state: b.state ?? "",
    country: b.country,
    linkedinUrl: b.linkedinUrl ?? "",
    githubUsername: b.githubUsername ?? "",
    portfolioUrl: b.portfolioUrl ?? "",
    headline: profile.headline ?? "",
    summary: profile.summary,
    totalExperienceYears:
      profile.totalExperienceMonths > 0
        ? String(Math.round((profile.totalExperienceMonths / 12) * 10) / 10)
        : "",
    skills: profile.skills.map((s) => ({
      name: s.displayName || skillDisplayName(s.id),
      years: s.years === undefined ? "" : String(s.years),
      level: s.level ?? "",
    })),
    experience: profile.experience.map((e) => ({
      id: e.id,
      company: e.company,
      title: e.title,
      location: e.location ?? "",
      startDate: e.startDate,
      endDate: e.endDate ?? "",
      current: e.endDate === null,
      bullets: e.bullets.join("\n"),
    })),
    education: profile.education.map((e) => ({
      id: e.id,
      institution: e.institution,
      degree: e.degree,
      field: e.field ?? "",
      startYear: e.startYear === undefined ? "" : String(e.startYear),
      endYear: e.endYear === undefined ? "" : String(e.endYear),
      grade: e.grade ?? "",
    })),
    projects: profile.projects.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      bullets: p.bullets.join("\n"),
      techStack: p.techStack.map(skillDisplayName).join(", "),
      repo: p.links.repo ?? "",
      live: p.links.live ?? "",
      included: p.included,
      highlight: p.highlight,
    })),
    certifications: profile.certifications.map((c) => ({
      id: c.id,
      name: c.name,
      issuer: c.issuer ?? "",
      year: c.year === undefined ? "" : String(c.year),
    })),
    languages: profile.languages.map((l) => ({ name: l.name, proficiency: l.proficiency ?? "" })),
    achievements: profile.achievements.join("\n"),
  };
}

export type FormResult = { ok: true; profile: Profile } | { ok: false; issues: string[] };

/** Builds a profile from the form; `base` keeps fields the form does not edit. */
export function formToProfile(values: ProfileFormValues, base: Profile, now: Date): FormResult {
  const nowIso = now.toISOString().replace(/\.\d{3}Z$/, "Z");
  const experience = values.experience.map((e) => ({
    id: e.id || crypto.randomUUID(),
    company: e.company.trim(),
    title: e.title.trim(),
    ...(opt(e.location) && { location: opt(e.location) }),
    startDate: e.startDate.trim(),
    endDate: e.current ? null : e.endDate.trim() || null,
    bullets: lines(e.bullets),
    skills: base.experience.find((x) => x.id === e.id)?.skills ?? [],
  }));
  const skills: Profile["skills"] = [];
  for (const s of values.skills) {
    const id = skillIdFor(s.name);
    if (!id || skills.some((k) => k.id === id)) continue;
    const years = Number(s.years);
    const previous = base.skills.find((k) => k.id === id);
    skills.push({
      id,
      displayName: s.name.trim(),
      ...(s.years.trim() !== "" && Number.isFinite(years) && { years }),
      ...(s.level !== "" && { level: s.level }),
      source: previous?.source ?? "user",
    });
  }
  const projects: Project[] = values.projects.map((p) => {
    const previous = base.projects.find((x) => x.id === p.id);
    const repo = withHttp(p.repo);
    const live = withHttp(p.live);
    return {
      id: p.id || crypto.randomUUID(),
      name: p.name.trim(),
      description: p.description.trim(),
      bullets: lines(p.bullets),
      techStack: skillIdsFor(
        p.techStack
          .split(",")
          .map((t) => t.trim())
          .filter((t) => t !== ""),
      ),
      links: { ...(repo && { repo }), ...(live && { live }) },
      source: previous?.source ?? "manual",
      ...(previous?.github && { github: previous.github }),
      included: p.included,
      highlight: p.highlight,
      updatedAt: nowIso,
    };
  });
  const manualYears = Number(values.totalExperienceYears);
  const computed = totalExperienceMonths(
    experience.filter((e) => /^\d{4}-\d{2}$/.test(e.startDate)),
    now,
  );
  const linkedinUrl = withHttp(values.linkedinUrl);
  const portfolioUrl = withHttp(values.portfolioUrl);
  const candidate: Profile = {
    ...base,
    basics: {
      ...base.basics,
      fullName: values.fullName.trim(),
      email: values.email.trim(),
      phone: values.phone.trim(),
      city: values.city.trim(),
      ...(opt(values.state) ? { state: values.state.trim() } : { state: undefined }),
      country: values.country.trim().toUpperCase(),
      linkedinUrl,
      githubUsername: opt(values.githubUsername),
      portfolioUrl,
    },
    headline: opt(values.headline),
    summary: values.summary.trim(),
    totalExperienceMonths:
      values.totalExperienceYears.trim() !== "" && Number.isFinite(manualYears)
        ? Math.round(manualYears * 12)
        : computed,
    skills,
    experience,
    education: values.education.map((e) => ({
      id: e.id || crypto.randomUUID(),
      institution: e.institution.trim(),
      degree: e.degree.trim(),
      ...(opt(e.field) && { field: opt(e.field) }),
      ...(year(e.startYear) !== undefined && { startYear: year(e.startYear) }),
      ...(year(e.endYear) !== undefined && { endYear: year(e.endYear) }),
      ...(opt(e.grade) && { grade: opt(e.grade) }),
    })),
    projects,
    certifications: values.certifications.map((c) => ({
      id: c.id || crypto.randomUUID(),
      name: c.name.trim(),
      ...(opt(c.issuer) && { issuer: opt(c.issuer) }),
      ...(year(c.year) !== undefined && { year: year(c.year) }),
    })),
    languages: values.languages
      .filter((l) => l.name.trim() !== "")
      .map((l) => ({
        name: l.name.trim(),
        ...(opt(l.proficiency) && { proficiency: opt(l.proficiency) }),
      })),
    achievements: lines(values.achievements),
    updatedAt: nowIso,
  };
  const parsed = ProfileSchema.safeParse(JSON.parse(JSON.stringify(candidate)));
  if (parsed.success) return { ok: true, profile: parsed.data };
  return { ok: false, issues: describeIssues(parsed.error.issues) };
}

const FIELD_NAMES: Record<string, string> = {
  startDate: "start date (YYYY-MM)",
  endDate: "end date (YYYY-MM)",
  country: "country (2-letter code such as IN)",
  linkedinUrl: "LinkedIn link",
  portfolioUrl: "portfolio link",
  company: "company",
  title: "job title",
  institution: "institution",
  degree: "degree",
  name: "name",
  repo: "repository link",
  live: "live link",
};

function describeIssues(issues: readonly z.core.$ZodIssue[]): string[] {
  return issues.map((issue) => {
    const path = issue.path.map(String);
    const field = path.at(-1) ?? "";
    const index = path.find((p) => /^\d+$/.test(p));
    const section = path[0] === "basics" ? "Basics" : (path[0] ?? "Profile");
    const where = index === undefined ? section : `${section} #${String(Number(index) + 1)}`;
    return `${where}: check the ${FIELD_NAMES[field] ?? field}`;
  });
}
