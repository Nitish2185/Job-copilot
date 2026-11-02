import { PreferencesForm } from "@/components/profile/PreferencesForm";
import { Loading } from "@/components/ui/States";
import { currencyForCountry } from "@/lib/profile/preferencesForm";
import { StepFooter, type StepProps } from "../StepFooter";
import { usePreferences, useProfile } from "../hooks";

/** Steps 6 and 7: the ask-once answers, then job preferences (spec 10). */
export function PreferencesStep({ next, back, part }: StepProps & { part: "ask-once" | "jobs" }) {
  const profile = useProfile();
  const preferences = usePreferences(profile?.basics.country);
  if (!profile || !preferences) return <Loading />;
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        {part === "ask-once"
          ? "Application forms ask these again and again. Answer once and Job Copilot reuses your answers. Every field can be changed later in your profile."
          : "Tell Job Copilot which jobs to show you. Jobs that do not fit are hidden or scored lower."}
      </p>
      <PreferencesForm
        key={part}
        preferences={preferences}
        currency={currencyForCountry(profile.basics.country)}
        part={part}
        submitLabel="Save and continue"
        onSaved={next}
      />
      <StepFooter back={back} />
    </div>
  );
}
