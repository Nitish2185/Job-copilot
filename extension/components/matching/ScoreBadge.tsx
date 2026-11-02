import type { JobScore } from "@job-copilot/shared";

/** The final score, with "estimate" when only the local prefilter scored the job. */
export function ScoreBadge({ score }: { score: JobScore | undefined }) {
  if (!score) {
    return <span className="text-xs text-slate-400">Not scored</span>;
  }
  const tone =
    score.final >= 80
      ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
      : score.final >= 60
        ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
        : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  return (
    <span
      className={`inline-flex flex-col items-center rounded-md px-2 py-0.5 ${tone}`}
      aria-label={`Score ${String(score.final)}${score.isEstimate ? ", estimate" : ""}`}
      data-testid="job-score"
    >
      <span className="text-base leading-tight font-semibold">{score.final}</span>
      {score.isEstimate && <span className="text-[10px] leading-tight">estimate</span>}
    </span>
  );
}
