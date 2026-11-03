import type { Application, Job, JobScore } from "@job-copilot/shared";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Link } from "react-router";
import { ScoreBadge } from "@/components/matching/ScoreBadge";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState, Loading } from "@/components/ui/States";
import { getDb } from "@/lib/db/db";
import { sendMessage } from "@/lib/messaging/client";

interface Row {
  application: Application;
  job?: Job;
  score?: JobScore;
  hasTailored: boolean;
  coverLetter?: string;
}

function ReviewItem({
  row,
  selected,
  onToggle,
}: {
  row: Row;
  selected: boolean;
  onToggle: () => void;
}) {
  const { application: app, job } = row;
  const [busy, setBusy] = useState(false);
  const needsTailored = app.resumeChoice === "tailored" && !row.hasTailored;
  const act = async (type: "queue/approve" | "queue/reject") => {
    setBusy(true);
    await sendMessage(type, { applicationId: app.id });
    setBusy(false);
  };
  return (
    <li
      className="space-y-2 rounded-md border border-stone-200 p-3 dark:border-stone-800"
      data-testid="review-item"
    >
      <div className="flex flex-wrap items-start gap-3">
        <input
          type="checkbox"
          className="mt-1"
          aria-label={`Select ${job?.title ?? "item"}`}
          checked={selected}
          onChange={onToggle}
        />
        <ScoreBadge score={row.score} />
        <div className="min-w-0 flex-1">
          {job ? (
            <Link to={`/jobs/${encodeURIComponent(job.id)}`} className="font-medium underline">
              {job.title} at {job.company.name}
            </Link>
          ) : (
            <span className="font-medium">A job that is no longer saved</span>
          )}
          <p className="text-sm text-amber-800 dark:text-amber-300">{app.needsYouDetail}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="primary"
            disabled={busy || needsTailored}
            onClick={() => void act("queue/approve")}
          >
            Approve
          </Button>
          <Button disabled={busy} onClick={() => void act("queue/reject")}>
            Reject
          </Button>
        </div>
      </div>
      <p className="text-sm">
        Resume: {app.resumeChoice === "tailored" ? "made for this job" : "your resume"}
        {needsTailored && job && (
          <>
            {" "}
            <Link
              to={`/jobs/${encodeURIComponent(job.id)}/resume`}
              className="text-brand-700 underline"
            >
              Make it first
            </Link>
          </>
        )}
      </p>
      {app.answersSent.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm">
            {String(app.answersSent.length)} answers that will be sent
          </summary>
          <ul className="mt-1 space-y-1 text-sm">
            {app.answersSent.map((a) => (
              <li
                key={`${a.question}:${String(a.answer)}`}
                className={a.source === "ai" ? "rounded bg-brand-50 px-1 dark:bg-brand-950" : ""}
              >
                <span className="font-medium">{a.question}:</span>{" "}
                {Array.isArray(a.answer) ? a.answer.join(", ") : String(a.answer)}{" "}
                {a.source === "ai" && <Badge tone="blue">AI, please check</Badge>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {row.coverLetter && (
        <details>
          <summary className="cursor-pointer text-sm">Cover letter</summary>
          <p className="mt-1 text-sm whitespace-pre-wrap">{row.coverLetter}</p>
        </details>
      )}
    </li>
  );
}

/** Approval queue for auto-apply (spec 18.1 `#/review`). */
export function ReviewPage() {
  const rows = useLiveQuery(async () => {
    const db = getDb();
    const apps = await db.applications
      .where("status")
      .equals("needs_you")
      .filter((a) => a.needsYouReason === "approval_required")
      .toArray();
    return Promise.all(
      apps.map(async (application): Promise<Row> => {
        const [job, score, versions, letter] = await Promise.all([
          db.jobs.get(application.jobId),
          db.scores.get(application.jobId),
          db.resumeVersions.where("jobId").equals(application.jobId).count(),
          db.coverLetters.where("jobId").equals(application.jobId).first(),
        ]);
        return {
          application,
          ...(job && { job }),
          ...(score && { score }),
          hasTailored: versions > 0,
          ...(letter && { coverLetter: letter.text }),
        };
      }),
    );
  }, []);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  if (!rows) return <Loading />;
  const approveSelected = async () => {
    for (const id of selected) await sendMessage("queue/approve", { applicationId: id });
    setSelected(new Set());
  };
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Review</h1>
        {selected.size > 0 && (
          <Button variant="primary" onClick={() => void approveSelected()}>
            Approve {String(selected.size)}
          </Button>
        )}
      </div>
      {rows.length === 0 ? (
        <EmptyState title="Nothing to review">
          Applications that need your approval appear here.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <ReviewItem
              key={row.application.id}
              row={row}
              selected={selected.has(row.application.id)}
              onToggle={() => {
                const next = new Set(selected);
                if (!next.delete(row.application.id)) next.add(row.application.id);
                setSelected(next);
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
