/**
 * Applies the AI's structured changes (spec 14.3) to the profile, checking every
 * text with the validator (14.4). Company names, titles, dates, education,
 * certifications and contact details always come from the profile.
 */
import type { Profile, Project } from "@job-copilot/shared";
import {
  BULLET_MAX_WORDS,
  SUMMARY_MAX_WORDS,
  allowedSkills,
  checkText,
  knownNames,
  type TextRules,
} from "./validate";

export interface TailorChanges {
  summary: string;
  skillsOrder: string[];
  experienceRewrites: { experienceId: string; bulletIndex: number; text: string }[];
  experienceBulletOrder: { experienceId: string; order: number[] }[];
  projectBullets: { projectId: string; bullets: string[] }[];
  keywordsTargeted: string[];
}

export interface TailoredBullet {
  text: string;
  /** Rewritten by the AI and accepted by the validator. */
  changed: boolean;
}

export interface TailoredContent {
  summary: string;
  summaryChanged: boolean;
  skills: { id: string; displayName: string }[];
  skillsReordered: boolean;
  experience: { experienceId: string; bullets: TailoredBullet[] }[];
  projects: { projectId: string; bullets: TailoredBullet[] }[];
  keywordsTargeted: string[];
}

export const PROJECT_BULLETS = { min: 2, max: 4 } as const;

function validOrder(order: readonly number[], length: number): boolean {
  return (
    order.length > 0 &&
    order.length <= length &&
    new Set(order).size === order.length &&
    order.every((i) => Number.isInteger(i) && i >= 0 && i < length)
  );
}

/** The tailored content plus every issue found; failed items keep the original text. */
export function applyTailoring(
  profile: Profile,
  picked: readonly Project[],
  changes: TailorChanges,
  options: { jobCompany?: string } = {},
): { content: TailoredContent; issues: string[] } {
  const issues: string[] = [];
  const known = knownNames(profile, options.jobCompany ? [options.jobCompany] : []);
  const certifications = profile.certifications.map((c) => c.name);
  const profileSkillIds = profile.skills.map((s) => s.id);
  const allBullets = profile.experience.flatMap((e) => e.bullets);
  const years = profile.totalExperienceMonths / 12;

  // Summary.
  const summaryRules: TextRules = {
    allowedSkills: allowedSkills(profileSkillIds, [profile.summary]),
    originals: [
      profile.summary,
      profile.headline ?? "",
      ...allBullets,
      ...profile.projects.flatMap((p) => [p.description, ...p.bullets]),
    ],
    allowedNumbers: [Math.floor(years), Math.round(years)],
    known,
    certifications,
    maxWords: SUMMARY_MAX_WORDS,
  };
  let summary = profile.summary;
  let summaryChanged = false;
  if (changes.summary.trim() !== "" && changes.summary.trim() !== profile.summary.trim()) {
    const problems = checkText(changes.summary, summaryRules);
    if (problems.length === 0) {
      summary = changes.summary.trim();
      summaryChanged = true;
    } else {
      issues.push(`Summary ${problems.join("; ")}. Your original summary is used.`);
    }
  }

  // Skills: existing IDs only, in the AI's order; the AI may leave some out.
  const byId = new Map(profile.skills.map((s) => [s.id, s]));
  const unknownSkills = changes.skillsOrder.filter((id) => !byId.has(id));
  if (unknownSkills.length > 0) {
    issues.push(
      `Skills list named skills you do not have (${unknownSkills.join(", ")}); they were left out.`,
    );
  }
  const ordered = [...new Set(changes.skillsOrder)].filter((id) => byId.has(id));
  const skillIds = ordered.length > 0 ? ordered : profileSkillIds;
  const skills = skillIds.map((id) => ({ id, displayName: byId.get(id)?.displayName ?? id }));
  const skillsReordered = skillIds.join() !== profileSkillIds.join();

  // Experience bullets: rewrite or reorder existing bullets only.
  const experienceIds = new Set(profile.experience.map((e) => e.id));
  for (const r of [...changes.experienceRewrites, ...changes.experienceBulletOrder]) {
    if (!experienceIds.has(r.experienceId)) {
      issues.push("A change pointed at a job that is not in your profile; it was ignored.");
    }
  }
  const experience = profile.experience.map((exp) => {
    const bullets: TailoredBullet[] = exp.bullets.map((text) => ({ text, changed: false }));
    for (const rewrite of changes.experienceRewrites.filter((r) => r.experienceId === exp.id)) {
      const original = exp.bullets[rewrite.bulletIndex];
      if (original === undefined) {
        issues.push(
          `A rewrite for ${exp.company} pointed at a bullet that does not exist; ignored.`,
        );
        continue;
      }
      if (rewrite.text.trim() === original.trim()) continue;
      const problems = checkText(rewrite.text, {
        allowedSkills: allowedSkills(profileSkillIds, [original]),
        originals: [original],
        known,
        certifications,
        maxWords: BULLET_MAX_WORDS,
      });
      if (problems.length === 0) {
        bullets[rewrite.bulletIndex] = { text: rewrite.text.trim(), changed: true };
      } else {
        issues.push(
          `A bullet for ${exp.title} at ${exp.company} ${problems.join("; ")}. The original is used.`,
        );
      }
    }
    const order = changes.experienceBulletOrder.find((o) => o.experienceId === exp.id)?.order;
    if (order && !validOrder(order, bullets.length)) {
      issues.push(`The bullet order for ${exp.company} was not valid; the original order is used.`);
    }
    const final =
      order && validOrder(order, bullets.length)
        ? order.map((i) => bullets[i]).filter((b): b is TailoredBullet => b !== undefined)
        : bullets;
    return { experienceId: exp.id, bullets: final };
  });

  // Project bullets: 2-4 per picked project, facts from that project only.
  const projects = picked.map((project) => {
    const original: TailoredBullet[] = project.bullets.map((text) => ({ text, changed: false }));
    const proposed = changes.projectBullets.find((p) => p.projectId === project.id)?.bullets;
    if (!proposed) return { projectId: project.id, bullets: original };
    let generated = proposed.map((b) => b.trim()).filter((b) => b !== "");
    if (generated.length > PROJECT_BULLETS.max) {
      issues.push(
        `${project.name} had more than ${String(PROJECT_BULLETS.max)} bullets; the extra ones were dropped.`,
      );
      generated = generated.slice(0, PROJECT_BULLETS.max);
    }
    const sources = [project.description, ...project.bullets, project.github?.readmeExcerpt ?? ""];
    const rules: TextRules = {
      allowedSkills: allowedSkills(project.techStack, sources),
      originals: sources,
      known,
      certifications,
      maxWords: BULLET_MAX_WORDS,
    };
    const bullets: TailoredBullet[] = [];
    generated.forEach((text, i) => {
      const problems = checkText(text, rules);
      if (problems.length === 0) {
        bullets.push({ text, changed: !project.bullets.includes(text) });
        return;
      }
      issues.push(`A bullet for ${project.name} ${problems.join("; ")}.`);
      const fallback = project.bullets[i];
      if (fallback !== undefined) bullets.push({ text: fallback, changed: false });
    });
    if (bullets.length < PROJECT_BULLETS.min && original.length >= bullets.length) {
      return { projectId: project.id, bullets: original };
    }
    return { projectId: project.id, bullets };
  });

  return {
    content: {
      summary,
      summaryChanged,
      skills,
      skillsReordered,
      experience,
      projects,
      keywordsTargeted: [...new Set(changes.keywordsTargeted)].slice(0, 25),
    },
    issues,
  };
}
