import { describe, expect, it } from "vitest";
import { z } from "zod";
import locationCases from "../../testcases/location.cases.json";
import remoteCases from "../../testcases/remote.cases.json";
import { RemoteSchema } from "../schemas/common";
import { goldenCases } from "../testcases";
import {
  LOCATIONS,
  detectRemote,
  parseCountries,
  parseCountriesFromLocations,
  splitLocationSegments,
} from "./location";
import { normalizeForMatching } from "./normalize";

const countryCases = goldenCases(
  z.object({ text: z.string(), expected: z.array(z.string()) }),
  locationCases,
);

const remoteGolden = goldenCases(
  z.object({
    input: z.object({
      workplaceType: z.string().nullable().optional(),
      isRemote: z.boolean().nullable().optional(),
      locations: z.array(z.string()),
      title: z.string(),
    }),
    expected: RemoteSchema,
  }),
  remoteCases,
);

describe("parseCountries golden cases", () => {
  it.each(countryCases.map((c) => [c.text, c.expected] as const))("%j", (text, expected) => {
    expect(parseCountries(text)).toEqual(expected);
  });
});

describe("detectRemote golden cases", () => {
  it.each(remoteGolden.map((c) => [JSON.stringify(c.input), c.input, c.expected] as const))(
    "%s",
    (_label, input, expected) => {
      expect(detectRemote(input)).toBe(expected);
    },
  );
});

describe("locations.json", () => {
  it("stores every name already normalized and without hyphens", () => {
    const names = [
      ...LOCATIONS.countries.flatMap((c) => c.names),
      ...LOCATIONS.regions.flatMap((r) => r.names),
      ...LOCATIONS.cities.flatMap((c) => c.names),
    ];
    const bad = names.filter((n) => normalizeForMatching(n) !== n || n.includes("-"));
    expect(bad).toEqual([]);
  });

  it("covers India's main tech cities with their old names", () => {
    for (const name of ["bangalore", "bengaluru", "gurgaon", "gurugram", "bombay", "mumbai"]) {
      expect(parseCountries(name), name).toEqual(["IN"]);
    }
  });
});

describe("parseCountriesFromLocations", () => {
  it("unions and sorts countries across locations", () => {
    expect(parseCountriesFromLocations(["London", "Bengaluru", "Remote - US"])).toEqual([
      "GB",
      "IN",
      "US",
    ]);
  });
});

describe("splitLocationSegments", () => {
  it("splits on separators and drops filler words", () => {
    expect(splitLocationSegments("remote - us & canada (hq)")).toEqual([
      "remote",
      "us",
      "canada",
      "hq",
    ]);
    expect(splitLocationSegments("anywhere in india")).toEqual(["india"]);
  });
});
