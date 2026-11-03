import type { JobScore } from "@job-copilot/shared";

/** The final score, with "estimate" when only the local prefilter scored the job. */
export function ScoreBadge({ score }: { score: JobScore | undefined }) {
  if (!score) {
    return (
      <span className="flex h-12 w-16 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-center text-xs text-stone-600 dark:bg-stone-800 dark:text-stone-300">
        Not scored
      </span>
    );
  }
  const tone =
    score.final >= 80
      ? "bg-green-50 text-green-800 ring-green-200 dark:bg-green-950 dark:text-green-300 dark:ring-green-900"
      : score.final >= 60
        ? "bg-brand-50 text-brand-800 ring-brand-200 dark:bg-brand-950 dark:text-brand-200 dark:ring-brand-900"
        : "bg-stone-100 text-stone-700 ring-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:ring-stone-700";
  return (
    <span
      className={`flex h-12 w-16 shrink-0 flex-col items-center justify-center rounded-lg ring-1 ring-inset ${tone}`}
      aria-label={`Score ${String(score.final)}${score.isEstimate ? ", estimate" : ""}`}
      data-testid="job-score"
    >
      <span className="text-lg leading-tight font-semibold">{score.final}</span>
      {score.isEstimate && <span className="text-xs leading-tight">estimate</span>}
    </span>
  );
}
