import { Button } from "@/components/ui/Button";
import { StepFooter, type StepProps } from "../StepFooter";

/** Step 1: privacy and modes in plain words (spec 10, step 1). */
export function WelcomeStep({ next }: StepProps) {
  return (
    <div className="space-y-4 text-sm leading-relaxed">
      <p>
        Job Copilot finds developer jobs that fit you and helps you apply. Before you start, here is
        what happens with your data.
      </p>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          <strong>Everything stays on this device.</strong> There is no account and no Job Copilot
          server. Your profile, resume and applications live in this browser.
        </li>
        <li>
          <strong>What goes to the AI provider:</strong> only if you set one up, your resume text
          and job descriptions, with your name, email, phone, address and profile links removed
          first. On Google Gemini’s free tier, Google may use what you send to improve its products.
        </li>
        <li>
          <strong>What goes to employers:</strong> only the applications you send.
        </li>
      </ul>
      <h2 className="pt-2 font-semibold">Two ways to apply</h2>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          <strong>Assist:</strong> Job Copilot fills in the form and you press submit yourself.
          Naukri, Indeed and LinkedIn are always Assist.
        </li>
        <li>
          <strong>Auto:</strong> on a few job sites (Greenhouse, Lever, Ashby, Workable,
          SmartRecruiters) Job Copilot can also submit for you. Auto-apply is <strong>off</strong>{" "}
          until you turn it on in Settings.
        </li>
      </ul>
      <StepFooter>
        <Button variant="primary" onClick={next}>
          Get started
        </Button>
      </StepFooter>
    </div>
  );
}
