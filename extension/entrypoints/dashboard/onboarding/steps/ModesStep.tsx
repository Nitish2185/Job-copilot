import type { Settings } from "@job-copilot/shared";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Loading } from "@/components/ui/States";
import { loadSettings, updateSettings } from "@/lib/settings/settings";
import { StepFooter, type StepProps } from "../StepFooter";

type ResumeDefault = Settings["autoApply"]["resumeDefault"];

const SITES: [site: string, mode: string, what: string][] = [
  [
    "Greenhouse, Lever, Ashby, Workable, SmartRecruiters",
    "Auto",
    "Fills the form. Submits only after you turn on auto-apply and the checks pass.",
  ],
  ["Workday and other company sites", "Assist", "Fills what it can. You press submit."],
  ["Naukri, Indeed, LinkedIn", "Always Assist", "Fills what it can. You press submit."],
];

const RESUME_CHOICES: [ResumeDefault, string][] = [
  ["current", "My uploaded resume"],
  ["tailored", "A resume tailored to each job"],
  ["tailored_above_score", "A tailored resume only for strong matches"],
];

/** Step 8: Auto vs Assist and the default resume choice (spec 10, step 8). */
export function ModesStep({ next, back }: StepProps) {
  const [choice, setChoice] = useState<ResumeDefault>();
  useEffect(() => {
    void loadSettings().then((s) => {
      setChoice(s.autoApply.resumeDefault);
    });
  }, []);
  if (!choice) return <Loading />;

  const save = async () => {
    await updateSettings({ autoApply: { resumeDefault: choice } });
    next();
  };

  return (
    <div className="space-y-4 text-sm">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">How Job Copilot applies on each site</caption>
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-800">
            <th scope="col" className="py-2 pr-3">
              Sites
            </th>
            <th scope="col" className="py-2 pr-3">
              Mode
            </th>
            <th scope="col" className="py-2">
              What happens
            </th>
          </tr>
        </thead>
        <tbody>
          {SITES.map(([site, mode, what]) => (
            <tr key={site} className="border-b border-slate-100 dark:border-slate-900">
              <td className="py-2 pr-3">{site}</td>
              <td className="py-2 pr-3 font-medium">{mode}</td>
              <td className="py-2">{what}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Auto-apply is <strong>off</strong>. You can turn it on later in Settings, where its limits
        and checks are explained.
      </p>
      <fieldset>
        <legend className="mb-2 font-medium">Which resume should applications use?</legend>
        <div className="space-y-1">
          {RESUME_CHOICES.map(([value, label]) => (
            <label key={value} className="flex items-center gap-2">
              <input
                type="radio"
                name="resume-default"
                value={value}
                checked={choice === value}
                onChange={() => {
                  setChoice(value);
                }}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <StepFooter back={back}>
        <Button variant="primary" onClick={() => void save()}>
          Continue
        </Button>
      </StepFooter>
    </div>
  );
}
