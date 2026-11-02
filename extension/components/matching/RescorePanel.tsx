import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorMessage } from "@/components/ui/States";
import { sendMessage } from "@/lib/messaging/client";

/** Jobs offered for AI re-scoring after a profile change (spec 10.1). */
export const RESCORE_TOP = 50;

/**
 * Shown after a profile or preference save: re-ranks every job locally (free),
 * then offers "Re-score top 50 with AI" instead of re-scoring everything.
 * Give it a new `key` after every save so the re-ranking runs again.
 */
export function RescorePanel() {
  const [ranked, setRanked] = useState<{ passed: number } | "running">("running");
  const [ai, setAi] = useState<{ configured: boolean; remaining: number }>();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string }>();

  useEffect(() => {
    void sendMessage("match/prefilter", { all: true })
      .then((r) => {
        setRanked({ passed: r.passed });
      })
      .catch(() => {
        setRanked({ passed: 0 });
      });
    void sendMessage("match/quota", {}).then(
      (q) => {
        setAi({ configured: q.aiConfigured, remaining: q.remaining });
      },
      () => undefined,
    );
  }, []);

  const rescore = async () => {
    setBusy(true);
    try {
      const r = await sendMessage("match/scoreNext", { count: RESCORE_TOP, order: "best" });
      setResult(
        r.error
          ? { ok: false, text: `Scored ${String(r.scored)} jobs, then stopped: ${r.error}` }
          : { ok: true, text: `Scored ${String(r.scored)} jobs with AI.` },
      );
      setAi((prev) => prev && { ...prev, remaining: r.remaining });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800">
      <p>
        {ranked === "running"
          ? "Re-ranking your jobs..."
          : `Jobs re-ranked for your updated profile: ${ranked.passed.toLocaleString()} fit.`}
      </p>
      {ai?.configured && ranked !== "running" && (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void rescore()} disabled={busy || ai.remaining === 0}>
            {busy ? "Scoring..." : `Re-score top ${String(RESCORE_TOP)} with AI`}
          </Button>
          <span className="text-xs text-slate-500">
            {String(ai.remaining)} AI scores left today
          </span>
        </div>
      )}
      {result &&
        (result.ok ? (
          <p className="text-green-700 dark:text-green-400">{result.text}</p>
        ) : (
          <ErrorMessage>{result.text}</ErrorMessage>
        ))}
    </div>
  );
}
