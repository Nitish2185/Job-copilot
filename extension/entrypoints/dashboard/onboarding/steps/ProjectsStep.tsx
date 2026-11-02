import { ProfileEditor } from "@/components/profile/ProfileEditor";
import { Button } from "@/components/ui/Button";
import { Loading } from "@/components/ui/States";
import { StepFooter, type StepProps } from "../StepFooter";
import { useProfile } from "../hooks";

/** Step 5: private, company or freelance projects added by hand (spec 10, step 5). */
export function ProjectsStep({ next, back }: StepProps) {
  const profile = useProfile();
  if (!profile) return <Loading />;
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Add work that is not on GitHub: company, freelance or private projects. Use “Add project” at
        the bottom of the list.
      </p>
      <ProfileEditor
        profile={profile}
        sections={["projects"]}
        submitLabel="Save and continue"
        onSaved={next}
      />
      <StepFooter back={back}>
        <Button variant="ghost" onClick={next}>
          Skip
        </Button>
      </StepFooter>
    </div>
  );
}
