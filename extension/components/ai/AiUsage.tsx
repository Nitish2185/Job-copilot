import { useEffect, useState } from "react";
import { ErrorMessage, Loading } from "@/components/ui/States";
import { sendMessage } from "@/lib/messaging/client";
import type { AiStatus } from "@/lib/messaging/protocol";

/** Today's AI usage against the daily budget (spec 11.4). */
export function AiUsage() {
  const [status, setStatus] = useState<AiStatus>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    sendMessage("ai/status", {}).then(setStatus, (e: unknown) => {
      setError(e instanceof Error ? e.message : "Could not read AI usage.");
    });
  }, []);
  if (error) return <ErrorMessage>{error}</ErrorMessage>;
  if (!status) return <Loading label="Reading AI usage..." />;
  const { usage } = status;
  return (
    <div className="space-y-1 text-sm">
      <p>
        {status.configured ? `Using ${status.model}.` : "AI is not set up. AI features are off."}
      </p>
      <p className="text-stone-600 dark:text-stone-400">
        Today: {String(usage.requests)} of {String(usage.budget)} requests,{" "}
        {String(usage.cacheHits)} answered from the cache, {String(usage.errors)} errors.
      </p>
      {usage.exhausted && (
        <p className="text-amber-700 dark:text-amber-300">
          The daily budget is used up.
          {usage.resumesAt && ` AI resumes at ${new Date(usage.resumesAt).toLocaleString()}.`}
        </p>
      )}
      {!usage.exhausted && usage.warning && (
        <p className="text-amber-700 dark:text-amber-300">Most of today’s budget is used.</p>
      )}
    </div>
  );
}
