/**
 * Tailoring without AI: nothing is reworded. Skills the job asks for move to the
 * front and each job's bullets are ordered by how many of the job's skills they
 * mention. Picked projects keep their own bullets.
 */
import { tagSkills, type JdAnalysis, type Profile } from "@job-copilot/shared";
import { jobSkillIds } from "./pick";
import type { TailorChanges } from "./tailor";

export function localTailorChanges(
  profile: Profile,
  analysis: Pick<JdAnalysis, "mustHave" | "keywords">,
): TailorChanges {
  const wanted = jobSkillIds(analysis);
  const relevance = (text: string) => tagSkills(text).filter((s) => wanted.has(s)).length;
  const skills = profile.skills.map((s) => s.id);
  return {
    summary: "",
    skillsOrder: [...skills.filter((s) => wanted.has(s)), ...skills.filter((s) => !wanted.has(s))],
    experienceRewrites: [],
    experienceBulletOrder: profile.experience.map((e) => ({
      experienceId: e.id,
      order: e.bullets
        .map((text, index) => ({ index, score: relevance(text) }))
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map((b) => b.index),
    })),
    projectBullets: [],
    keywordsTargeted: [...wanted].filter((s) => skills.includes(s)),
  };
}
