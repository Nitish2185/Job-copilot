import type { Application, Job } from "@job-copilot/shared";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { EmptyState, ErrorMessage, Loading } from "@/components/ui/States";
import { getDb } from "@/lib/db/db";
import { sendMessage } from "@/lib/messaging/client";

const REASONS: Record<string, string> = {
  captcha: "The site showed a CAPTCHA",
  verification_code: "The site asks for a verification code",
  unknown_required_question: "A required question is not in your profile",
  missing_sensitive_answer: "A question only you can answer",
  validation_error: "The site did not accept some answers",
  login_required: "The site wants you to log in",
  consent_required: "The form asks you to agree to something",
  other: "Needs a look",
};

function Item({ app, job }: { app: Application; job?: Job }) {
  const pending = app.pendingQuestions ?? [];
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const retry = async () => {
    setBusy(true);
    setError(undefined);
    const filled = pending
      .filter((p) => (answers[p.question] ?? "").trim() !== "")
      .map((p) => ({
        question: p.question,
        key: p.key,
        answer: (answers[p.question] ?? "").trim(),
      }));
    if (filled.length === 0) {
      setError("Answer at least one question.");
      setBusy(false);
      return;
    }
    await sendMessage("queue/answer", { applicationId: app.id, answers: filled });
    setBusy(false);
  };

  const openAndFinish = async () => {
    setError(undefined);
    const result = await sendMessage("queue/openAndFinish", { applicationId: app.id });
    if (!result.ok) setError(result.error ?? "Could not open the form.");
  };

  return (
    <li
      className="space-y-2 rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800"
      data-testid="needs-you-item"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          {job ? (
            <Link to={`/jobs/${encodeURIComponent(job.id)}`} className="font-medium underline">
              {job.title} at {job.company.name}
            </Link>
          ) : (
            <span className="font-medium">A job that is no longer saved</span>
          )}
          <p className="text-amber-800 dark:text-amber-300">
            {app.dryRun ? "Dry run" : (REASONS[app.needsYouReason ?? "other"] ?? "Needs a look")}:{" "}
            {app.needsYouDetail}
          </p>
        </div>
        <Button onClick={() => void openAndFinish()}>Open &amp; finish</Button>
      </div>
      {app.dryRun && app.answersSent.length > 0 && (
        <details open>
          <summary className="cursor-pointer">This is what would have been submitted</summary>
          <ul className="mt-1 list-disc pl-5">
            {app.answersSent.map((a) => (
              <li key={a.question}>
                {a.question}: {Array.isArray(a.answer) ? a.answer.join(", ") : String(a.answer)}
              </li>
            ))}
          </ul>
        </details>
      )}
      {pending.length > 0 && (
        <div className="space-y-2">
          {pending.map((p) => (
            <label key={p.question} className="block">
              <span className="font-medium">{p.question}</span>
              {p.note && <span className="block text-xs text-slate-500">{p.note}</span>}
              <input
                className={inputClass}
                value={answers[p.question] ?? ""}
                onChange={(e) => {
                  setAnswers({ ...answers, [p.question]: e.target.value });
                }}
              />
            </label>
          ))}
          <Button variant="primary" disabled={busy} onClick={() => void retry()}>
            Answer &amp; retry
          </Button>
          <p className="text-xs text-slate-500">
            Your answers are saved to your saved answers and reused next time.
          </p>
        </div>
      )}
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </li>
  );
}

/** Stopped applications with the reason (spec 18.1 `#/needs-you`). */
export function NeedsYouPage() {
  const rows = useLiveQuery(async () => {
    const db = getDb();
    const apps = await db.applications
      .where("status")
      .equals("needs_you")
      .filter((a) => a.needsYouReason !== "approval_required")
      .toArray();
    const jobs = await db.jobs.bulkGet(apps.map((a) => a.jobId));
    return apps.map((app, i) => ({ app, job: jobs[i] }));
  }, []);
  if (!rows) return <Loading />;
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Needs you</h1>
      {rows.length === 0 ? (
        <EmptyState title="Nothing needs you">
          Applications that stopped for a reason appear here.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {rows.map(({ app, job }) => (
            <Item key={app.id} app={app} {...(job && { job })} />
          ))}
        </ul>
      )}
    </div>
  );
}
