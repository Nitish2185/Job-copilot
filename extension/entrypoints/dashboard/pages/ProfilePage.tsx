import { useState } from "react";
import { Link } from "react-router";
import { PreferencesForm } from "@/components/profile/PreferencesForm";
import { ProfileEditor } from "@/components/profile/ProfileEditor";
import { Loading } from "@/components/ui/States";
import { currencyForCountry } from "@/lib/profile/preferencesForm";
import { usePreferences, useProfile } from "../hooks";

type Tab = "profile" | "answers";

/** Edit everything from onboarding later (spec 10.1). Every save bumps the profile version. */
export function ProfilePage() {
  const profile = useProfile();
  const preferences = usePreferences(profile?.basics.country);
  const [tab, setTab] = useState<Tab>("profile");
  const [saved, setSaved] = useState<string>();
  if (!profile || !preferences) return <Loading />;

  const tabClass = (t: Tab) =>
    `rounded-md px-3 py-1.5 text-sm ${
      tab === t
        ? "bg-blue-50 font-medium text-blue-800 dark:bg-blue-950 dark:text-blue-200"
        : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
    }`;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold">Profile</h1>
        <p className="text-xs text-slate-500">
          Version {String(profile.version)}
          {profile.baseResume && ` · Resume: ${profile.baseResume.fileName}`} ·{" "}
          <Link to="/onboarding" className="text-blue-700 underline dark:text-blue-400">
            Run setup again
          </Link>
        </p>
      </div>
      <div role="tablist" aria-label="Profile sections" className="flex gap-2">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "profile"}
          className={tabClass("profile")}
          onClick={() => {
            setTab("profile");
            setSaved(undefined);
          }}
        >
          About you
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "answers"}
          className={tabClass("answers")}
          onClick={() => {
            setTab("answers");
            setSaved(undefined);
          }}
        >
          Answers and job preferences
        </button>
      </div>
      {saved && (
        <p role="status" className="text-sm text-green-700 dark:text-green-400">
          {saved}
        </p>
      )}
      <div role="tabpanel">
        {tab === "profile" ? (
          <ProfileEditor
            key={profile.id}
            profile={profile}
            onSaved={(p) => {
              setSaved(`Saved. Profile version ${String(p.version)}.`);
            }}
          />
        ) : (
          <PreferencesForm
            preferences={preferences}
            currency={currencyForCountry(profile.basics.country)}
            onSaved={() => {
              setSaved("Saved.");
            }}
          />
        )}
      </div>
    </div>
  );
}
