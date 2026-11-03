import type { ApplicationStage } from "@job-copilot/shared";
import { Badge } from "@/components/ui/Badge";
import type { TrackerRow } from "@/lib/tracker/store";
import { openStoredFile } from "@/lib/files/open";
import { STAGES, STAGE_LABELS, followUpDate, formatDay } from "@/lib/tracker/tracker";

/** The tracker as a table (spec 18.1); the stage changes from the row's menu. */
export function TrackerList({
  rows,
  followUpDays,
  onOpen,
  onMove,
  flagsFor,
}: {
  rows: TrackerRow[];
  followUpDays: number;
  onOpen: (id: string) => void;
  onMove: (id: string, stage: ApplicationStage) => void;
  flagsFor: (row: TrackerRow) => string[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm" data-testid="tracker-list">
        <thead className="border-b border-stone-200 text-xs text-stone-500 dark:border-stone-800">
          <tr>
            <th className="py-2 pr-3 font-medium">Job</th>
            <th className="py-2 pr-3 font-medium">Stage</th>
            <th className="py-2 pr-3 font-medium">Applied</th>
            <th className="py-2 pr-3 font-medium">Follow-up</th>
            <th className="py-2 pr-3 font-medium">Resume sent</th>
            <th className="py-2 font-medium">Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const title = `${row.job?.title ?? "Job"} at ${row.job?.company.name ?? ""}`;
            return (
              <tr key={row.app.id} className="border-b border-stone-100 dark:border-stone-800">
                <td className="py-2 pr-3">
                  <button
                    type="button"
                    className="text-left hover:underline focus-visible:outline-2 focus-visible:outline-brand-600"
                    onClick={() => {
                      onOpen(row.app.id);
                    }}
                  >
                    <span className="block font-medium">{row.job?.title ?? "Job"}</span>
                    <span className="block text-xs text-stone-500">{row.job?.company.name}</span>
                  </button>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {row.app.mode === "auto" && <Badge tone="blue">Auto</Badge>}
                    {flagsFor(row).map((f) => (
                      <Badge key={f} tone="amber">
                        {f}
                      </Badge>
                    ))}
                  </span>
                </td>
                <td className="py-2 pr-3">
                  <select
                    aria-label={`Stage of ${title}`}
                    className="rounded border border-stone-300 bg-white px-1.5 py-1 dark:border-stone-700 dark:bg-stone-900"
                    value={row.app.stage}
                    onChange={(e) => {
                      onMove(row.app.id, e.target.value as ApplicationStage);
                    }}
                  >
                    {STAGES.map((s) => (
                      <option key={s} value={s}>
                        {STAGE_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2 pr-3 whitespace-nowrap">{formatDay(row.app.submittedAt)}</td>
                <td className="py-2 pr-3 whitespace-nowrap">
                  {row.app.stage === "applied"
                    ? formatDay(followUpDate(row.app, followUpDays)?.toISOString())
                    : ""}
                </td>
                <td className="max-w-56 py-2 pr-3">
                  {row.resume.fileId ? (
                    <button
                      type="button"
                      className="truncate text-left text-brand-700 underline dark:text-brand-300"
                      title={row.resume.name}
                      onClick={() => void openStoredFile(row.resume.fileId ?? "", "preview")}
                    >
                      {row.resume.name}
                    </button>
                  ) : (
                    <span className="text-stone-600 dark:text-stone-400">
                      {row.resume.tailored ? "Made for this job" : "Your resume"}
                    </span>
                  )}
                </td>
                <td className="max-w-64 truncate py-2 text-stone-600 dark:text-stone-400">
                  {row.app.notes}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
