/**
 * Skill tagger (spec 7.5). The Go crawler has a line-by-line port in
 * crawler/internal/skills; both must pass shared/testcases/skills.cases.json.
 *
 * Algorithm:
 * 1. Normalize the text (normalizeForMatching): ASCII lowercase, single spaces.
 * 2. Aliases, longest first: every occurrence that passes the boundary rules
 *    (parsing/phrase.ts) and is not fully inside a span already claimed by a longer
 *    alias tags its skill and claims the span. So "react native" hides the "react"
 *    inside it and "sql server" hides "sql". Partial overlaps both count:
 *    "rest api design" tags both "rest api" and "api design".
 * 3. Context patterns (for ambiguous names such as "go") are matched in strict mode
 *    and ignore claimed spans, so "c/c++" can tag C while "c++" tags C++, and
 *    "in go-to-market" or "in R&D" do not count.
 * 4. Add implied skills (transitively), then sort and de-duplicate.
 */
import { normalizeForMatching } from "../parsing/normalize";
import { comparePhrases, containsPhrase, matchClaimingPhrases } from "../parsing/phrase";
import { SKILLS, type SkillDefinition } from "./dictionary";

interface Phrase {
  text: string;
  key: string;
}

export interface SkillTagger {
  tag(text: string): string[];
}

export function createSkillTagger(skills: readonly SkillDefinition[]): SkillTagger {
  const aliases: Phrase[] = [];
  const contexts: Phrase[] = [];
  const implies = new Map<string, readonly string[]>();

  for (const skill of skills) {
    for (const alias of skill.aliases) aliases.push({ text: alias, key: skill.id });
    for (const pattern of skill.contextPatterns ?? []) {
      contexts.push({ text: pattern, key: skill.id });
    }
    if (skill.implies?.length) implies.set(skill.id, skill.implies);
  }
  aliases.sort(comparePhrases);
  contexts.sort(comparePhrases);

  return {
    tag(input: string): string[] {
      const text = normalizeForMatching(input);
      const found = new Set<string>();

      matchClaimingPhrases(text, aliases, (alias) => found.add(alias.key));

      for (const context of contexts) {
        if (!found.has(context.key) && containsPhrase(text, context.text, true)) {
          found.add(context.key);
        }
      }

      // Implied skills, transitively ("spring-boot" -> "spring" -> "java").
      const queue = [...found];
      while (queue.length > 0) {
        const id = queue.pop();
        if (id === undefined) break;
        for (const implied of implies.get(id) ?? []) {
          if (!found.has(implied)) {
            found.add(implied);
            queue.push(implied);
          }
        }
      }

      return [...found].sort();
    },
  };
}

const defaultTagger = createSkillTagger(SKILLS);

/** Canonical skill IDs found in the text, sorted and de-duplicated. */
export function tagSkills(text: string): string[] {
  return defaultTagger.tag(text);
}
