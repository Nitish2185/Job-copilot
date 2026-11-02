import { describe, expect, it } from "vitest";
import { z } from "zod";
import data from "../../testcases/normalize.cases.json";
import { goldenCases } from "../testcases";
import { makeSnippet, normalizeForMatching } from "./normalize";

const cases = goldenCases(
  z.object({ text: z.string(), matching: z.string(), snippet: z.string() }),
  data,
);

describe("normalize golden cases", () => {
  it.each(cases.map((c) => [c.text.slice(0, 40), c] as const))("%j", (_label, c) => {
    expect(normalizeForMatching(c.text)).toBe(c.matching);
    expect(makeSnippet(c.text)).toBe(c.snippet);
  });

  it("always produces pure ASCII for matching", () => {
    for (const c of cases) expect(normalizeForMatching(c.text)).toMatch(/^[\x20-\x7e]*$/);
  });

  it("never returns a snippet longer than 300 UTF-16 units", () => {
    for (const c of cases) expect(makeSnippet(c.text).length).toBeLessThanOrEqual(300);
  });
});
