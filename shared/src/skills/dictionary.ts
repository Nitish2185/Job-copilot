import { z } from "zod";
import skillsData from "../../data/skills.json";

export const SKILL_CATEGORIES = [
  "language",
  "frontend",
  "backend",
  "database",
  "cloud",
  "devops",
  "testing",
  "mobile",
  "data",
  "ml",
  "tool",
  "practice",
] as const;
export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

export const SkillDefinitionSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  display: z.string().min(1),
  category: z.enum(SKILL_CATEGORIES),
  /** Always matched (whole word, case-insensitive). */
  aliases: z.array(z.string().min(1)).min(1),
  /** The bare short name is ordinary English, so it is matched only in context. */
  ambiguous: z.boolean().optional(),
  /** Phrases that prove the ambiguous name means this skill, e.g. "go developer". */
  contextPatterns: z.array(z.string().min(1)).optional(),
  /** Skills this one always brings along, e.g. "mern" -> mongodb, express, react, nodejs. */
  implies: z.array(z.string()).optional(),
});
export type SkillDefinition = z.infer<typeof SkillDefinitionSchema>;

export const SkillDictionarySchema = z.object({
  version: z.string().min(1),
  skills: z.array(SkillDefinitionSchema).min(1),
});
export type SkillDictionary = z.infer<typeof SkillDictionarySchema>;

const dictionary = SkillDictionarySchema.parse(skillsData);

/** Version stamp written to the feed index as `skillsVersion`. */
export const SKILLS_VERSION = dictionary.version;

export const SKILLS: readonly SkillDefinition[] = dictionary.skills;

const byId = new Map(SKILLS.map((skill) => [skill.id, skill]));

export function getSkill(id: string): SkillDefinition | undefined {
  return byId.get(id);
}

export function skillDisplayName(id: string): string {
  return byId.get(id)?.display ?? id;
}
