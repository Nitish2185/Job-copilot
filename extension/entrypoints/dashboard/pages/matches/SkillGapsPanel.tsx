import { skillDisplayName } from "@job-copilot/shared";
import type { SkillGap } from "@/lib/matching/matchList";

/** "Learn next": skills missing across the user's best jobs (spec 12.3). */
export function SkillGapsPanel({ gaps, top }: { gaps: readonly SkillGap[]; top: number }) {
  if (gaps.length === 0) return null;
  return (
    <details className="rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
      <summary className="cursor-pointer font-medium">Learn next</summary>
      <p className="mt-1 text-slate-600 dark:text-slate-400">
        Skills your best {String(top)} matches ask for that your profile does not list.
      </p>
      <ul className="mt-2 grid gap-1 sm:grid-cols-2" aria-label="Skills to learn next">
        {gaps.map((gap) => (
          <li key={gap.skill} className="flex justify-between gap-2">
            <span>{skillDisplayName(gap.skill)}</span>
            <span className="text-slate-500">
              {String(gap.jobs)} job{gap.jobs === 1 ? "" : "s"}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
