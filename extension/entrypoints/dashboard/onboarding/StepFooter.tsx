import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";

/** Back button plus the step's own actions. */
export function StepFooter({ back, children }: { back?: () => void; children?: ReactNode }) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
      {back && (
        <Button variant="ghost" onClick={back}>
          Back
        </Button>
      )}
      <div className="ml-auto flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export interface StepProps {
  next: () => void;
  back: () => void;
}
