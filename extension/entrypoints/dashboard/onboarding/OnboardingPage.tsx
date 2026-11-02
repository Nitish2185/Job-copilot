import { useEffect, useState, type ComponentType } from "react";
import { Loading } from "@/components/ui/States";
import { loadFlags, updateFlags } from "@/lib/settings/settings";
import type { StepProps } from "./StepFooter";
import { AiStep } from "./steps/AiStep";
import { DoneStep } from "./steps/DoneStep";
import { GithubStep } from "./steps/GithubStep";
import { ModesStep } from "./steps/ModesStep";
import { PreferencesStep } from "./steps/PreferencesStep";
import { ProjectsStep } from "./steps/ProjectsStep";
import { ResumeStep } from "./steps/ResumeStep";
import { WelcomeStep } from "./steps/WelcomeStep";

const AskOnceStep = (props: StepProps) => <PreferencesStep {...props} part="ask-once" />;
const JobsStep = (props: StepProps) => <PreferencesStep {...props} part="jobs" />;

const STEPS: { title: string; Component: ComponentType<StepProps> }[] = [
  { title: "Welcome", Component: WelcomeStep },
  { title: "AI setup", Component: AiStep },
  { title: "Resume", Component: ResumeStep },
  { title: "GitHub projects", Component: GithubStep },
  { title: "Other projects", Component: ProjectsStep },
  { title: "Common questions", Component: AskOnceStep },
  { title: "Jobs you want", Component: JobsStep },
  { title: "How applying works", Component: ModesStep },
  { title: "Done", Component: DoneStep },
];

/**
 * The first-run wizard (spec 10). The furthest step reached is saved in local
 * flags after every step, so the user can stop and continue later.
 */
export function OnboardingPage() {
  const [step, setStep] = useState<number>();
  const [reached, setReached] = useState(0);

  useEffect(() => {
    void loadFlags().then((flags) => {
      const saved = Math.min(flags.onboardingStep ?? 0, STEPS.length - 1);
      setStep(saved);
      setReached(saved);
    });
  }, []);

  if (step === undefined) return <Loading />;
  const current = STEPS[step] ?? STEPS[0];
  if (!current) return null;

  const go = (target: number) => {
    const furthest = Math.max(reached, target);
    setStep(target);
    setReached(furthest);
    void updateFlags({ onboardingStep: furthest });
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="mx-auto max-w-4xl p-6 sm:p-8">
      <nav aria-label="Setup steps" className="mb-6">
        <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <button
                type="button"
                disabled={i > reached}
                aria-current={i === step ? "step" : undefined}
                onClick={() => {
                  go(i);
                }}
                className={`rounded px-1 py-0.5 ${
                  i === step
                    ? "font-semibold text-blue-700 dark:text-blue-300"
                    : "text-slate-600 enabled:hover:underline disabled:text-slate-400 dark:text-slate-400"
                }`}
              >
                {String(i + 1)}. {s.title}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <h1 className="mb-4 text-2xl font-semibold">{current.title}</h1>
      <current.Component
        next={() => {
          go(Math.min(step + 1, STEPS.length - 1));
        }}
        back={() => {
          go(Math.max(step - 1, 0));
        }}
      />
    </div>
  );
}
