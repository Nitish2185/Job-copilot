import { describe, expect, it } from "vitest";
import { normalizeForMatching } from "../parsing/normalize";
import { SKILLS, SKILLS_VERSION, getSkill, withImpliedSkills } from "./dictionary";

describe("skills.json", () => {
  it("has at least 300 skills", () => {
    expect(SKILLS.length).toBeGreaterThanOrEqual(300);
  });

  it("has a date version for the feed index", () => {
    expect(SKILLS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("has unique skill IDs", () => {
    const ids = SKILLS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("maps every alias to exactly one skill", () => {
    const owners = new Map<string, string>();
    const duplicates: string[] = [];
    for (const skill of SKILLS) {
      for (const alias of skill.aliases) {
        const owner = owners.get(alias);
        if (owner !== undefined) duplicates.push(`${alias} (${owner}, ${skill.id})`);
        owners.set(alias, skill.id);
      }
    }
    expect(duplicates).toEqual([]);
  });

  it("stores aliases and context patterns already normalized", () => {
    const bad: string[] = [];
    for (const skill of SKILLS) {
      for (const phrase of [...skill.aliases, ...(skill.contextPatterns ?? [])]) {
        if (normalizeForMatching(phrase) !== phrase) bad.push(`${skill.id}: "${phrase}"`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("only implies skills that exist", () => {
    const missing = SKILLS.flatMap((s) =>
      (s.implies ?? []).filter((id) => !getSkill(id)).map((id) => `${s.id} -> ${id}`),
    );
    expect(missing).toEqual([]);
  });

  it("never lists an ambiguous short word as an alias", () => {
    const words = [
      "go",
      "r",
      "c",
      "spring",
      "express",
      "node",
      "rails",
      "helm",
      "chef",
      "unity",
      "gin",
      "spark",
      "hive",
      "excel",
      "apex",
      "storm",
      "less",
      "chai",
      "ember",
      "backbone",
      "bun",
      "phoenix",
      "zig",
      "assembly",
      "rest",
      "mean",
      "lamp",
      "lambda",
      "ai",
      "ts",
    ];
    const leaks = SKILLS.flatMap((s) =>
      s.aliases.filter((a) => words.includes(a)).map((a) => `${s.id}: ${a}`),
    );
    expect(leaks).toEqual([]);
  });

  it("marks the ambiguous names the spec lists", () => {
    for (const id of ["go", "r", "c", "spring", "express"]) {
      expect(getSkill(id)?.ambiguous, id).toBe(true);
    }
    expect(getSkill("go")?.aliases).toContain("golang");
  });

  it("only uses context patterns on ambiguous skills", () => {
    const misplaced = SKILLS.filter((s) => (s.contextPatterns?.length ?? 0) > 0 && !s.ambiguous);
    expect(misplaced.map((s) => s.id)).toEqual([]);
  });

  it("expands implied skills transitively", () => {
    const skills = withImpliedSkills(["spring-boot"]);
    expect(skills.has("spring")).toBe(true);
    expect(skills.has("java")).toBe(true);
    expect(withImpliedSkills([]).size).toBe(0);
  });
});
