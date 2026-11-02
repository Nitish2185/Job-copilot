/** Maps free-text skill names from AI output or users to canonical skill IDs. */
import { getSkill, tagSkills } from "@job-copilot/shared";

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\+\+/g, "pp")
    .replace(/#/g, "sharp")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The canonical ID for one skill name: an exact dictionary match, the first
 * tagged skill, or a slug for skills the dictionary does not know.
 */
export function skillIdFor(name: string): string | undefined {
  const exact = slug(name);
  if (exact && getSkill(exact)) return exact;
  const tagged = tagSkills(name);
  if (tagged.length > 0) return tagged[0];
  return exact === "" ? undefined : exact;
}

/** Canonical IDs for a list of names, de-duplicated, order kept. */
export function skillIdsFor(names: readonly string[]): string[] {
  const out: string[] = [];
  for (const name of names) {
    const id = skillIdFor(name);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}
