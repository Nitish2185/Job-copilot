import { describe, expect, it } from "vitest";
import { z } from "zod";
import data from "../../testcases/experience.cases.json";
import { goldenCases } from "../testcases";
import { parseExperience } from "./experience";

const cases = goldenCases(
  z.object({
    text: z.string(),
    expected: z.object({ min: z.number().optional(), max: z.number().optional() }),
  }),
  data,
);

describe("parseExperience golden cases", () => {
  it.each(cases.map((c) => [c.text, c.expected] as const))("%j", (text, expected) => {
    expect(parseExperience(text)).toEqual(expected);
  });
});
