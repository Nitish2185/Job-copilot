import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/Button";
import { FeedNotice } from "@/components/matching/FeedNotice";
import { sendMessage } from "@/lib/messaging/client";
import { StepFooter, type StepProps } from "../StepFooter";

/** Top matches scored with AI right after setup (when AI is set up). */
const FIRST_AI_BATCH = 20;

interface Summary {
  openJobs?: number;
  passed: number;
  aiScored: number;
  aiError?: string;
}

const PHASES = [
  "Downloading today’s jobs...",
  "Ranking jobs for you...",
  "Scoring your top matches with AI...",
];

/** Step 9: first feed sync and scoring with progress, then the Matches page (spec 10, step 9). */
export function DoneStep({ back }: StepProps) {
  const navigate = useNavigate();
  const started = useRef(false);
  const [phase, setPhase] = useState(0);
  const [summary, setSummary] = useState<Summary>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    // Effects run twice in development; one run is enough.
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const feed = await sendMessage("feed/sync", { force: false });
        if (feed.status === "error")
          setError(feed.error ?? "The job feed could not be downloaded.");
        setPhase(1);
        const ranked = await sendMessage("match/prefilter", { all: true });
        const result: Summary = {
          ...(feed.totalOpenJobs !== undefined && { openJobs: feed.totalOpenJobs }),
          passed: ranked.passed,
          aiScored: 0,
        };
        const quota = await sendMessage("match/quota", {});
        if (quota.aiConfigured && ranked.passed > 0) {
          setPhase(2);
          const ai = await sendMessage("match/scoreNext", { count: FIRST_AI_BATCH, order: "best" });
          result.aiScored = ai.scored;
          if (ai.error) result.aiError = ai.error;
        }
        setSummary(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Setup could not finish.");
        setSummary({ passed: 0, aiScored: 0 });
      }
    })();
  }, []);

  return (
    <div className="space-y-4 text-sm">
      <p>Your profile is ready. Job Copilot is now finding jobs that fit you.</p>
      {!summary && (
        <div>
          <progress
            className="w-full"
            max={PHASES.length}
            value={phase}
            aria-label="Setting up your matches"
          />
          <p className="mt-1 text-stone-500">{PHASES[phase]}</p>
        </div>
      )}
      {summary && !(error && summary.passed === 0) && (
        <p role="status" className="text-green-700 dark:text-green-400">
          {summary.openJobs !== undefined
            ? `${summary.openJobs.toLocaleString()} open jobs ready. `
            : "Jobs are up to date. "}
          {`${summary.passed.toLocaleString()} fit your profile.`}
          {summary.aiScored > 0 && ` ${String(summary.aiScored)} scored with AI.`}
        </p>
      )}
      {summary?.aiError && (
        <p className="text-amber-700 dark:text-amber-300">
          AI scoring stopped early: {summary.aiError}. Jobs show estimates until they are scored.
        </p>
      )}
      {error && <FeedNotice error={error} />}
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
