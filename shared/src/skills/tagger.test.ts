import { describe, expect, it } from "vitest";
import { z } from "zod";
import data from "../../testcases/skills.cases.json";
import { goldenCases } from "../testcases";
import { createSkillTagger, tagSkills } from "./tagger";

const cases = goldenCases(z.object({ text: z.string(), expected: z.array(z.string()) }), data);

describe("tagSkills golden cases", () => {
  it("has at least 120 cases", () => {
    expect(cases.length).toBeGreaterThanOrEqual(120);
  });

  it("keeps every expected list sorted", () => {
    for (const c of cases) expect(c.expected).toEqual([...c.expected].sort());
  });

  it.each(cases.map((c) => [c.text, c.expected] as const))("%j", (text, expected) => {
    expect(tagSkills(text)).toEqual(expected);
  });
});

describe("createSkillTagger", () => {
  const tagger = createSkillTagger([
    { id: "a", display: "A", category: "tool", aliases: ["alpha"], implies: ["b"] },
    { id: "b", display: "B", category: "tool", aliases: ["beta"], implies: ["c"] },
    { id: "c", display: "C", category: "tool", aliases: ["gamma"] },
  ]);

  it("adds implied skills transitively", () => {
    expect(tagger.tag("alpha")).toEqual(["a", "b", "c"]);
  });

  it("returns sorted, de-duplicated IDs", () => {
    expect(tagger.tag("gamma beta gamma")).toEqual(["b", "c"]);
  });
});
