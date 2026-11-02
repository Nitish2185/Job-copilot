/**
 * Location -> country codes, and remote detection (spec 7.4). The Go crawler has
 * a port in crawler/internal/parsing; both pass location.cases.json and
 * remote.cases.json.
 *
 * parseCountries(location):
 * 1. Normalize (normalizeForMatching).
 * 2. Names of 4+ characters (countries, states, cities) are searched as whole
 *    phrases, longest first; a match inside a longer one is skipped, so
 *    "new mexico" is not Mexico and "northern ireland" is not Ireland.
 * 3. The text is split into segments on , ; / | ( ) [ ] & + and " - ", " or ",
 *    " and ". Filler words ("remote", "based", "in", ...) are dropped unless a
 *    segment is nothing but filler. A segment that exactly equals any name
 *    ("uk", "nyc", "usa") adds its country.
 * 4. A segment that is a bare 2-3 letter code ("ca", "in", "on", "nsw") is
 *    resolved last: a state of a country whose city was found wins ("San
 *    Francisco, CA" -> US; "Indianapolis, IN" -> US); otherwise an ISO country
 *    code wins ("Remote, IN" -> India; "Toronto, CA" -> Canada); otherwise a state.
 */
import { z } from "zod";
import locationData from "../../data/locations.json";
import type { Remote } from "../schemas/common";
import { normalizeForMatching } from "./normalize";
import { comparePhrases, containsPhrase, matchClaimingPhrases } from "./phrase";

const LocationDataSchema = z.object({
  version: z.string(),
  description: z.string(),
  countries: z.array(
    z.object({
      code: z.string().regex(/^[A-Z]{2}$/),
      name: z.string(),
      names: z.array(z.string().min(1)),
    }),
  ),
  regions: z.array(
    z.object({
      country: z.string().regex(/^[A-Z]{2}$/),
      abbr: z
        .string()
        .regex(/^[a-z]{2,3}$/)
        .optional(),
      names: z.array(z.string().min(1)),
    }),
  ),
  cities: z.array(
    z.object({ country: z.string().regex(/^[A-Z]{2}$/), names: z.array(z.string().min(1)) }),
  ),
});

export const LOCATIONS = LocationDataSchema.parse(locationData);

type PlaceKind = "country" | "region" | "city";
interface Place {
  text: string;
  key: string;
  country: string;
  kind: PlaceKind;
}

const MIN_PHRASE_LENGTH = 4;

const FILLER_WORDS = new Set([
  "remote",
  "hybrid",
  "onsite",
  "on",
  "site",
  "office",
  "offices",
  "only",
  "based",
  "anywhere",
  "in",
  "within",
  "the",
  "area",
  "metro",
  "greater",
  "region",
  "timezone",
  "time",
  "zone",
  "zones",
  "hq",
  "headquarters",
  "flexible",
  "wfh",
  "fully",
  "preferred",
  "or",
  "and",
  "of",
  "from",
  "work",
  "home",
  "location",
  "locations",
  "multiple",
  "various",
  "city",
  "virtual",
  "distributed",
  "first",
  "friendly",
  "eligible",
  "available",
  "any",
  "across",
  "near",
  "to",
]);

const SEPARATOR_CHARS = new Set([",", ";", "/", "|", "(", ")", "[", "]", "&", "+"]);
const SEPARATOR_WORDS = [" - ", " or ", " and "];

const places: Place[] = [];
const exactNames = new Map<string, Place[]>();
const abbreviations = new Map<string, string[]>();
const isoCodes = new Map<string, string>();

function addPlace(text: string, country: string, kind: PlaceKind): void {
  const place: Place = { text, key: `${kind}:${country}`, country, kind };
  places.push(place);
  const list = exactNames.get(text) ?? [];
  list.push(place);
  exactNames.set(text, list);
}

for (const c of LOCATIONS.countries) {
  isoCodes.set(c.code.toLowerCase(), c.code);
  for (const name of c.names) addPlace(name, c.code, "country");
}
for (const r of LOCATIONS.regions) {
  for (const name of r.names) addPlace(name, r.country, "region");
  if (r.abbr !== undefined) {
    const list = abbreviations.get(r.abbr) ?? [];
    list.push(r.country);
    abbreviations.set(r.abbr, list);
  }
}
for (const c of LOCATIONS.cities) {
  for (const name of c.names) addPlace(name, c.country, "city");
}

const searchablePlaces = places.filter((p) => p.text.length >= MIN_PHRASE_LENGTH);
searchablePlaces.sort(comparePhrases);

export function splitLocationSegments(text: string): string[] {
  let replaced = "";
  for (const ch of text) replaced += SEPARATOR_CHARS.has(ch) ? "," : ch;
  for (const word of SEPARATOR_WORDS) replaced = replaced.split(word).join(",");
  return replaced
    .split(",")
    .map((segment) => cleanSegment(segment.trim()))
    .filter((segment) => segment !== "");
}

function cleanSegment(segment: string): string {
  const tokens = segment.split(/[ -]/).filter((t) => t !== "");
  const kept = tokens.filter((t) => !FILLER_WORDS.has(t));
  return kept.length > 0 ? kept.join(" ") : tokens.join(" ");
}

/** ISO-2 country codes mentioned in one location string, sorted. */
export function parseCountries(location: string): string[] {
  const text = normalizeForMatching(location);
  const found = new Set<string>();
  const cityCountries = new Set<string>();
  const note = (place: Place) => {
    found.add(place.country);
    if (place.kind === "city") cityCountries.add(place.country);
  };

  matchClaimingPhrases(text, searchablePlaces, note);

  const codes: string[] = [];
  for (const segment of splitLocationSegments(text)) {
    const exact = exactNames.get(segment);
    if (exact) {
      exact.forEach(note);
    } else if (abbreviations.has(segment) || isoCodes.has(segment)) {
      codes.push(segment);
    }
  }

  for (const code of codes) {
    const stateCountries = [...(abbreviations.get(code) ?? [])].sort();
    const resolved =
      stateCountries.find((country) => cityCountries.has(country)) ??
      isoCodes.get(code) ??
      stateCountries[0];
    if (resolved !== undefined) found.add(resolved);
  }

  return [...found].sort();
}

/** Union of countries across all of a job's locations. */
export function parseCountriesFromLocations(locations: readonly string[]): string[] {
  const all = new Set<string>();
  for (const location of locations) for (const code of parseCountries(location)) all.add(code);
  return [...all].sort();
}

export interface RemoteInput {
  /** ATS field such as Lever/Ashby `workplaceType`. */
  workplaceType?: string | null;
  /** ATS field such as Ashby `isRemote`. */
  isRemote?: boolean | null;
  locations: readonly string[];
  title: string;
}

/** API fields first, then "hybrid"/"remote" in the locations or title. */
export function detectRemote(input: RemoteInput): Remote {
  const workplace = normalizeForMatching(input.workplaceType ?? "")
    .split("")
    .filter((ch) => ch !== " " && ch !== "-" && ch !== "_")
    .join("");
  if (workplace === "remote") return "remote";
  if (workplace === "hybrid") return "hybrid";
  if (workplace === "onsite" || workplace === "inoffice" || workplace === "office") return "onsite";
  if (input.isRemote === true) return "remote";

  const text = normalizeForMatching([...input.locations, input.title].join(" | "));
  if (containsPhrase(text, "hybrid")) return "hybrid";
  if (
    containsPhrase(text, "remote") ||
    containsPhrase(text, "wfh") ||
    containsPhrase(text, "work from home")
  ) {
    return "remote";
  }
  return "unknown";
}
