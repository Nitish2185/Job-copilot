/**
 * Tracker logic (spec 19.1, 19.2): stage changes as timestamped events, the
 * follow-up date, the "Mark as ghosted?" suggestion and the CSV export.
 */
import {
  APPLICATION_STAGES,
  type Application,
  type ApplicationStage,
  type Job,
} from "@job-copilot/shared";

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

export const STAGE_LABELS: Record<ApplicationStage, string> = {
  applied: "Applied",
  screening: "Screening",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  ghosted: "Ghosted",
  accepted: "Accepted",
};

/** The label of a stage name read from stored text (unknown names are shown as they are). */
export function stageLabel(value: string): string {
  return (STAGE_LABELS as Partial<Record<string, string>>)[value] ?? value;
}

/** "3 Oct" in the user's locale. */
export function formatDay(value: string | undefined): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** Board columns, in the spec's order. */
export const STAGES: readonly ApplicationStage[] = APPLICATION_STAGES;

/** Applications that were sent and so belong on the tracker. */
export function isTracked(app: Application): boolean {
  return app.status === "submitted" || app.status === "unconfirmed";
}

/** Moves an application to a stage, recording the change. No change, no event. */
export function moveStage(app: Application, stage: ApplicationStage, now: Date): Application {
  if (app.stage === stage) return app;
  return {
    ...app,
    stage,
    events: [...app.events, { at: iso(now), type: "stage", detail: `${app.stage} -> ${stage}` }],
  };
}

/** When the stage last changed (or when it was submitted). */
export function stageSince(app: Application): string | undefined {
  const last = [...app.events].reverse().find((e) => e.type === "stage");
  return last?.at ?? app.submittedAt;
}

/** The follow-up date: the user's own, else `followUpDays` after submitting. */
export function followUpDate(app: Application, followUpDays: number): Date | undefined {
  if (app.followUpAt) return new Date(app.followUpAt);
  if (!app.submittedAt) return undefined;
  return new Date(Date.parse(app.submittedAt) + followUpDays * DAY);
}

/** A follow-up is due while the application is still at "applied" (spec 19.2). */
export function followUpDue(app: Application, followUpDays: number, now: Date): boolean {
  if (!isTracked(app) || app.stage !== "applied") return false;
  if (app.events.some((e) => e.type === "follow_up_done")) return false;
  const due = followUpDate(app, followUpDays);
  return due !== undefined && due.getTime() <= now.getTime();
}

/** Suggest "Mark as ghosted?" after `ghostedAfterDays` with no reply. */
export function suggestGhosted(app: Application, ghostedAfterDays: number, now: Date): boolean {
  if (!isTracked(app) || (app.stage !== "applied" && app.stage !== "screening")) return false;
  if (app.events.some((e) => e.type === "ghosted_dismissed")) return false;
  const since = stageSince(app);
  return since !== undefined && now.getTime() - Date.parse(since) >= ghostedAfterDays * DAY;
}

/** Adds a note-style event (follow-up sent, suggestion dismissed). */
export function addEvent(app: Application, type: string, now: Date, detail?: string): Application {
  return {
    ...app,
    events: [...app.events, { at: iso(now), type, ...(detail && { detail }) }],
  };
}

function csvCell(value: string): string {
  // Cells starting with a formula character are prefixed so spreadsheets show them as text.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export const CSV_COLUMNS = [
  "Company",
  "Title",
  "Stage",
  "Mode",
  "Platform",
  "Submitted",
  "Resume",
  "Follow-up",
  "Job URL",
  "Notes",
] as const;

/** The tracker as CSV (spec 18.1). */
export function trackerCsv(
  rows: readonly { app: Application; job: Job | undefined }[],
  followUpDays: number,
): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const { app, job } of rows) {
    const followUp = followUpDate(app, followUpDays);
    lines.push(
      [
        job?.company.name ?? "",
        job?.title ?? "",
        STAGE_LABELS[app.stage],
        app.mode,
        job?.platform ?? "",
        app.submittedAt?.slice(0, 10) ?? "",
        app.resumeChoice,
        followUp ? iso(followUp).slice(0, 10) : "",
        job?.url ?? "",
        app.notes,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}
