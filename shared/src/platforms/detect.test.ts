import { describe, expect, it } from "vitest";
import { z } from "zod";
import data from "../../testcases/platform-urls.cases.json";
import { FeedPlatformSchema } from "../schemas/feed";
import { goldenCases } from "../testcases";
import { detectPlatform } from "./detect";

const cases = goldenCases(
  z.object({
    url: z.string(),
    html: z.string().optional(),
    expected: z
      .object({
        platform: FeedPlatformSchema,
        token: z.string().nullable(),
        jobId: z.string().optional(),
        variant: z.literal("eu").optional(),
      })
      .nullable(),
  }),
  data,
);

describe("detectPlatform golden cases", () => {
  it("has at least 40 cases", () => {
    expect(cases.length).toBeGreaterThanOrEqual(40);
  });

  it.each(cases.map((c) => [c.html ? `${c.url} + html` : c.url, c] as const))("%s", (_l, c) => {
    expect(detectPlatform(c.url, c.html)).toEqual(c.expected);
  });
});
