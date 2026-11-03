import { useState } from "react";
import { Link } from "react-router";
import { RescorePanel } from "@/components/matching/RescorePanel";
import { AnswerBankEditor } from "@/components/profile/AnswerBankEditor";
import { PreferencesForm } from "@/components/profile/PreferencesForm";
import { ProfileEditor } from "@/components/profile/ProfileEditor";
import { Loading } from "@/components/ui/States";
import { currencyForCountry } from "@/lib/profile/preferencesForm";
import { usePreferences, useProfile } from "../hooks";

type Tab = "profile" | "preferences" | "answers";

const TABS: [Tab, string][] = [
  ["profile", "About you"],
  ["preferences", "Answers and job preferences"],
  ["answers", "Saved answers"],
];

/** Edit everything from onboarding later (spec 10.1). Every save bumps the profile version. */
export function ProfilePage() {
  const profile = useProfile();
  const preferences = usePreferences(profile?.basics.country);
  const [tab, setTab] = useState<Tab>("profile");
  const [saved, setSaved] = useState<string>();
  // Counts saves that change matching, so jobs are re-ranked after each one.
  const [matchingSaves, setMatchingSaves] = useState(0);
  if (!profile || !preferences) return <Loading />;

  const tabClass = (t: Tab) =>
    `rounded-md px-3 py-1.5 text-sm ${
      tab === t
        ? "bg-brand-50 font-medium text-brand-800 dark:bg-brand-950 dark:text-brand-200"
        : "text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-900"
    }`;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="text-xs text-stone-500">
          Version {String(profile.version)}
          {profile.baseResume && ` · Resume: ${profile.baseResume.fileName}`} ·{" "}
          <Link to="/onboarding" className="text-brand-700 underline dark:text-brand-400">
            Run setup again
          </Link>
        </p>
      </div>
      <div role="tablist" aria-label="Profile sections" className="flex flex-wrap gap-2">
        {TABS.map(([t, label]) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={tabClass(t)}
            onClick={() => {
              setTab(t);
              setSaved(undefined);
              setMatchingSaves(0);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {saved && (
        <p role="status" className="text-sm text-green-700 dark:text-green-400">
          {saved}
        </p>
      )}
      {matchingSaves > 0 && <RescorePanel key={matchingSaves} />}
      <div role="tabpanel">
        {tab === "profile" && (
          <ProfileEditor
            key={profile.id}
            profile={profile}
            onSaved={(p) => {
              setSaved(`Saved. Profile version ${String(p.version)}.`);
              setMatchingSaves((n) => n + 1);
            }}
          />
        )}
        {tab === "preferences" && (
          <PreferencesForm
            preferences={preferences}
            currency={currencyForCountry(profile.basics.country)}
            onSaved={() => {
              setSaved("Saved.");
              setMatchingSaves((n) => n + 1);
            }}
          />
        )}
        {tab === "answers" && <AnswerBankEditor />}
      </div>
    </div>
  );
}
