import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/Button";
import { ErrorMessage } from "@/components/ui/States";
import { sendMessage } from "@/lib/messaging/client";
import type { FeedSyncResult } from "@/lib/messaging/protocol";
import { StepFooter, type StepProps } from "../StepFooter";

/** Step 9: first feed sync with progress, then the Matches page (spec 10, step 9). */
export function DoneStep({ back }: StepProps) {
  const navigate = useNavigate();
  const started = useRef(false);
  const [result, setResult] = useState<FeedSyncResult>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    // Effects run twice in development; one sync is enough.
    if (started.current) return;
    started.current = true;
    sendMessage("feed/sync", { force: false }).then(setResult, (e: unknown) => {
      setError(e instanceof Error ? e.message : "The job feed could not be downloaded.");
    });
  }, []);

  const failed = error ?? (result?.status === "error" ? result.error : undefined);
  return (
    <div className="space-y-4 text-sm">
      <p>Your profile is ready. Job Copilot is now downloading today’s developer jobs.</p>
      {!result && !error && (
        <div>
          <progress className="w-full" aria-label="Downloading jobs" />
          <p className="mt-1 text-slate-500">This can take a minute the first time.</p>
        </div>
      )}
      {result && result.status !== "error" && (
        <p role="status" className="text-green-700 dark:text-green-400">
          {result.totalOpenJobs !== undefined
            ? `${result.totalOpenJobs.toLocaleString()} open jobs ready.`
            : "Jobs are up to date."}
        </p>
      )}
      {failed && (
        <ErrorMessage>
          {failed} Job Copilot will try again in the background; you can look at your matches later.
        </ErrorMessage>
      )}
      <StepFooter back={back}>
        <Button
          variant="primary"
          onClick={() => {
            void navigate("/matches");
          }}
        >
          See my matches
        </Button>
      </StepFooter>
    </div>
  );
}
