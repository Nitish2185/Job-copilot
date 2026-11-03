import { useState } from "react";
import { AiSettingsForm } from "@/components/ai/AiSettingsForm";
import { Button } from "@/components/ui/Button";
import { StepFooter, type StepProps } from "../StepFooter";
import { useAiConfigured } from "../../hooks";

/** Step 2: AI provider setup, which can be skipped (spec 10, step 2). */
export function AiStep({ next, back }: StepProps) {
  const configured = useAiConfigured();
  const [tested, setTested] = useState(false);
  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-600 dark:text-stone-400">
        AI reads your resume, describes your projects and scores jobs. It is optional: without it
        you fill in your profile by hand and jobs are matched by skills only.
      </p>
      <AiSettingsForm onSaved={setTested} />
      <StepFooter back={back}>
        <Button variant="ghost" onClick={next}>
          Skip for now
        </Button>
        <Button variant="primary" onClick={next} disabled={!tested && configured !== true}>
          Continue
        </Button>
      </StepFooter>
    </div>
  );
}
