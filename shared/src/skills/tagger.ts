/**
 * Skill tagger (spec 7.5). The Go crawler has a line-by-line port in
 * crawler/internal/skills; both must pass shared/testcases/skills.cases.json.
 *
 * Algorithm:
 * 1. Normalize the text (normalizeForMatching): ASCII lowercase, single spaces.
 * 2. Aliases, longest first: every occurrence that passes the boundary rules and
 *    is not fully inside a span already claimed by a longer alias tags its skill
 *    and claims the span. So "react native" claims its span and "react" inside it
 *    is not tagged, and "sql server" hides "sql". Partial overlaps both count:
 *    "rest api design" tags both "rest api" and "api design".
 * 3. Context patterns (for ambiguous names such as "go") are matched with stricter
 *    right boundaries and ignore claimed spans, so "c/c++" can tag C while "c++"
 *    tags C++.
 * 4. Add implied skills (transitively), then sort and de-duplicate.
 *
 * Boundary rules:
 * - If the phrase starts with a word character [a-z0-9], the character before it
 *   must not be one.
 * - If the phrase ends with a word character, the character after it must not be
 *   a word character, "+" or "#" (so "c" never matches inside "c++" or "c#").
 *   Context patterns also reject "-", "&" and "'" after the phrase, so "in go-to-market"
 *   and "in R&D" do not count.
 */
import { isWordChar, normalizeForMatching } from "../parsing/normalize";
import { SKILLS, type SkillDefinition } from "./dictionary";

interface Phrase {
  text: string;
  skillId: string;
}

export interface SkillTagger {
  tag(text: string): string[];
}

const STRICT_EXTRA_BLOCKERS = new Set(["-", "&", "'"]);

function startsOk(text: string, start: number, phrase: string): boolean {
  if (!isWordChar(phrase[0])) return true;
  return start === 0 || !isWordChar(text[start - 1]);
}

function endsOk(text: string, end: number, phrase: string, strict: boolean): boolean {
  if (!isWordChar(phrase[phrase.length - 1])) return true;
  if (end >= text.length) return true;
  const next = text[end];
  if (next === undefined) return true;
  if (isWordChar(next) || next === "+" || next === "#") return false;
  return !(strict && STRICT_EXTRA_BLOCKERS.has(next));
}

/** Longest first, then by phrase, then by skill ID: a total order both languages agree on. */
function comparePhrases(a: Phrase, b: Phrase): number {
  if (a.text.length !== b.text.length) return b.text.length - a.text.length;
  if (a.text !== b.text) return a.text < b.text ? -1 : 1;
  if (a.skillId === b.skillId) return 0;
  return a.skillId < b.skillId ? -1 : 1;
}

export function createSkillTagger(skills: readonly SkillDefinition[]): SkillTagger {
  const aliases: Phrase[] = [];
  const contexts: Phrase[] = [];
  const implies = new Map<string, readonly string[]>();

  for (const skill of skills) {
    for (const alias of skill.aliases) aliases.push({ text: alias, skillId: skill.id });
    for (const pattern of skill.contextPatterns ?? []) {
      contexts.push({ text: pattern, skillId: skill.id });
    }
    if (skill.implies?.length) implies.set(skill.id, skill.implies);
  }
  aliases.sort(comparePhrases);
  contexts.sort(comparePhrases);

  return {
    tag(input: string): string[] {
      const text = normalizeForMatching(input);
      const found = new Set<string>();
      const claimed: [number, number][] = [];
      const insideClaim = (start: number, end: number) =>
        claimed.some(([s, e]) => s <= start && end <= e);

      for (const { text: phrase, skillId } of aliases) {
        let at = text.indexOf(phrase);
        while (at !== -1) {
          const end = at + phrase.length;
          if (
            startsOk(text, at, phrase) &&
            endsOk(text, end, phrase, false) &&
            !insideClaim(at, end)
          ) {
            found.add(skillId);
            claimed.push([at, end]);
          }
          at = text.indexOf(phrase, at + 1);
        }
      }

      for (const { text: phrase, skillId } of contexts) {
        if (found.has(skillId)) continue;
        let at = text.indexOf(phrase);
        while (at !== -1) {
          if (startsOk(text, at, phrase) && endsOk(text, at + phrase.length, phrase, true)) {
            found.add(skillId);
            break;
          }
          at = text.indexOf(phrase, at + 1);
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
