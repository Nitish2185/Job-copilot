/**
 * Builds the structured resume (ResumeDocument) the PDF is rendered from
 * (spec 14.2 step 5). Facts always come from the profile; a tailored version
 * only changes the summary, skill order, bullet wording and order, and which
 * projects appear.
 */
import {
  LOCATIONS,
  skillDisplayName,
  type Profile,
  type Project,
  type ResumeDocument,
} from "@job-copilot/shared";
import type { TailoredContent } from "./tailor";

const countryNames = new Map(LOCATIONS.countries.map((c) => [c.code, c.name]));

/** "Pune, Maharashtra, India" from the profile's city, state and country code. */
export function locationLine(basics: Profile["basics"]): string {
  return [basics.city, basics.state, countryNames.get(basics.country) ?? basics.country]
    .map((p) => p?.trim() ?? "")
    .filter((p) => p !== "")
    .join(", ");
}

function links(basics: Profile["basics"]): ResumeDocument["basics"]["links"] {
  const out: ResumeDocument["basics"]["links"] = [];
  if (basics.linkedinUrl) out.push({ label: "LinkedIn", url: basics.linkedinUrl });
  if (basics.githubUsername) {
    out.push({ label: "GitHub", url: `https://github.com/${basics.githubUsername}` });
  }
  if (basics.portfolioUrl) out.push({ label: "Portfolio", url: basics.portfolioUrl });
  out.push(...basics.otherLinks);
  return out;
}

/** Projects for a resume that is not made for one job: "Always include" first, then the newest real ones. */
export function baseProjects(profile: Profile, count = 3): Project[] {
  const real = profile.projects.filter((p) => p.included);
  const recent = (p: Project) => p.github?.pushedAt ?? p.updatedAt;
  return [
    ...real.filter((p) => p.highlight),
    ...real.filter((p) => !p.highlight).sort((a, b) => recent(b).localeCompare(recent(a))),
  ].slice(0, count);
}

export function buildResumeDocument(
  profile: Profile,
  options: { projects: readonly Project[]; content?: TailoredContent },
): ResumeDocument {
  const { content } = options;
  const bulletsFor = (experienceId: string, fallback: string[]) =>
    content?.experience.find((e) => e.experienceId === experienceId)?.bullets.map((b) => b.text) ??
    fallback;
  const projectBullets = (project: Project) =>
    content?.projects.find((p) => p.projectId === project.id)?.bullets.map((b) => b.text) ??
    project.bullets;
  const experience = [...profile.experience].sort(
    (a, b) =>
      (b.endDate ?? "9999").localeCompare(a.endDate ?? "9999") ||
      b.startDate.localeCompare(a.startDate),
  );
  return {
    basics: {
      fullName: profile.basics.fullName,
      ...(profile.headline && { headline: profile.headline }),
      email: profile.basics.email,
      phone: profile.basics.phone,
      location: locationLine(profile.basics),
      links: links(profile.basics),
    },
    summary: content?.summary ?? profile.summary,
    skills:
      content?.skills ?? profile.skills.map((s) => ({ id: s.id, displayName: s.displayName })),
    experience: experience.map((e) => ({
      experienceId: e.id,
      company: e.company,
      title: e.title,
      ...(e.location && { location: e.location }),
      startDate: e.startDate,
      endDate: e.endDate,
      bullets: bulletsFor(e.id, e.bullets),
    })),
    projects: options.projects.map((p) => {
      const link = p.links.live ?? p.links.repo;
      return {
        projectId: p.id,
        name: p.name,
        description: p.description,
        bullets: projectBullets(p),
        techStack: p.techStack.map(skillDisplayName),
        ...(link && { link }),
      };
    }),
    education: profile.education.map((e) => ({
      institution: e.institution,
      degree: e.degree,
      ...(e.field && { field: e.field }),
      ...(e.startYear !== undefined && { startYear: e.startYear }),
      ...(e.endYear !== undefined && { endYear: e.endYear }),
      ...(e.grade && { grade: e.grade }),
    })),
    certifications: profile.certifications.map((c) => ({
      name: c.name,
      ...(c.issuer && { issuer: c.issuer }),
      ...(c.year !== undefined && { year: c.year }),
    })),
    achievements: profile.achievements,
  };
}

function fileSafe(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9 ]+/g, "")
    .trim()
    .replace(/\s+/g, "_");
}

/** `<FirstName>_<LastName>_Resume_<Company>.pdf`, sanitized (spec 14.5). */
export function resumeFileName(fullName: string, company?: string): string {
  const parts = fullName.trim().split(/\s+/);
  const name = [parts[0], parts.length > 1 ? parts[parts.length - 1] : undefined]
    .filter((p): p is string => Boolean(p))
    .map(fileSafe)
    .filter((p) => p !== "")
    .join("_");
  const companyPart = company ? fileSafe(company) : "";
  return `${name || "My"}_Resume${companyPart ? `_${companyPart}` : ""}.pdf`;
}

/** "Jul 2022" from "2022-07". */
export function monthYear(value: string): string {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
