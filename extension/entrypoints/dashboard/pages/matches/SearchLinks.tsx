import { skillDisplayName } from "@job-copilot/shared";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { getDb } from "@/lib/db/db";
import { searchLinks, searchQuery, type SearchInput } from "@/lib/jobs/searchLinks";
import { loadSettings } from "@/lib/settings/settings";

/** "Search on Naukri / Indeed / LinkedIn" (spec 13.6): plain links, opened only on click. */
export function SearchLinks() {
  const [country, setCountry] = useState<string>();
  useEffect(() => {
    void loadSettings().then((s) => {
      setCountry(s.sources.indeedCountry);
    });
  }, []);
  const input = useLiveQuery(async (): Promise<SearchInput | undefined> => {
    const db = getDb();
    const [profile, prefs] = await Promise.all([db.profile.get("me"), db.preferences.get("me")]);
    if (!profile) return undefined;
    return {
      role: prefs?.desiredRoles[0] ?? "",
      skills: [...profile.skills]
        .sort((a, b) => (b.years ?? 0) - (a.years ?? 0))
        .map((s) => skillDisplayName(s.id)),
      city: prefs?.preferredLocations[0] ?? profile.basics.city,
      years: profile.totalExperienceMonths / 12,
      indeedCountry: "in",
    };
  }, []);
  if (!input || country === undefined) return null;
  const full = { ...input, indeedCountry: country };
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span className="text-slate-600 dark:text-slate-400">Search “{searchQuery(full)}” on</span>
      {searchLinks(full).map((link) => (
        <a
          key={link.site}
          href={link.url}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-blue-700 underline dark:text-blue-400"
        >
          {link.site}
        </a>
      ))}
    </p>
  );
}
