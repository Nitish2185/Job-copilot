/**
 * Side panel extras for the page the user is on (spec 13.4, 16.6, 17): save
 * the job, "Did you submit?", saved answers to copy, "Apply automatically via
 * <platform>" for company-site links, and "Report a broken page".
 */
import type { Job } from "@job-copilot/shared";
import { useLiveQuery } from "dexie-react-hooks";
import { useState, type ReactNode } from "react";
import { browser } from "wxt/browser";
import { Button } from "@/components/ui/Button";
import { ErrorMessage } from "@/components/ui/States";
import { answerToText } from "@/lib/answers/answerBank";
import { getDb } from "@/lib/db/db";
import { autoPlatformFor } from "@/lib/jobs/autoPlatform";
import { sendMessage } from "@/lib/messaging/client";

function Note({ ok, children }: { ok: boolean; children: ReactNode }) {
  return ok ? (
    <p role="status" className="text-sm text-green-700 dark:text-green-400">
      {children}
    </p>
  ) : (
    <ErrorMessage>{children}</ErrorMessage>
  );
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="ghost"
      aria-label={label}
      onClick={() =>
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
        })
      }
    >
      {done ? "Copied" : "Copy"}
    </Button>
  );
}

/** Reads the job on the page (adapter, schema.org data, else the AI) and saves it. */
export function SaveJobButton({ tabId, onSaved }: { tabId: number; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string }>();
  const save = async () => {
    setBusy(true);
    setNote(undefined);
    try {
      const r = await sendMessage("jobs/saveFromTab", { tabId, score: false });
      if (r.jobId) {
        setNote({ ok: true, text: r.created ? "Saved." : "Already saved." });
        onSaved();
      } else {
        setNote({ ok: false, text: r.error ?? "No job found on this page." });
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-1">
      <Button onClick={() => void save()} disabled={busy}>
        {busy ? "Reading the page..." : "Save this job"}
      </Button>
      {note && <Note ok={note.ok}>{note.text}</Note>}
    </div>
  );
}

/** After Autofill, when the site showed no confirmation: ask (spec 16.6). */
export function SubmittedPrompt({
  tabId,
  resumeChoice,
}: {
  tabId: number;
  resumeChoice: "current" | "tailored";
}) {
  const [answered, setAnswered] = useState<"yes" | "no">();
  const [error, setError] = useState<string>();
  if (answered === "no") return null;
  const yes = async () => {
    const r = await sendMessage("apply/markApplied", { tabId, resumeChoice });
    if (r.created) setAnswered("yes");
    else setError(r.error ?? "Not saved.");
  };
  return (
    <div
      className="space-y-2 rounded-md border border-stone-200 p-3 text-sm dark:border-stone-800"
      aria-label="Did you submit?"
      role="group"
    >
      {answered === "yes" ? (
        <Note ok>Saved to your applications.</Note>
      ) : (
        <>
          <p className="font-medium">Did you submit this application?</p>
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => void yes()}>
              Yes, I submitted it
            </Button>
            <Button
              onClick={() => {
                setAnswered("no");
              }}
            >
              Not yet
            </Button>
          </div>
        </>
      )}
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </div>
  );
}

/** Saved answers with copy buttons, for questions Autofill could not place (chat boxes). */
export function SavedAnswers() {
  const [filter, setFilter] = useState("");
  const answers = useLiveQuery(
    () =>
      getDb()
        .answerBank.filter((a) => a.status === "active" && !a.sensitive)
        .toArray(),
    [],
  );
  if (!answers || answers.length === 0) return null;
  const needle = filter.trim().toLowerCase();
  const shown = answers
    .filter((a) => !needle || a.question.toLowerCase().includes(needle))
    .sort((a, b) => b.timesUsed - a.timesUsed)
    .slice(0, 8);
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium">Saved answers</summary>
      <label htmlFor="answer-filter" className="sr-only">
        Find a saved answer
      </label>
      <input
        id="answer-filter"
        placeholder="Find a saved answer"
        value={filter}
        onChange={(e) => {
          setFilter(e.target.value);
        }}
        className="mt-2 w-full rounded-md border border-stone-300 bg-white px-2 py-1 text-sm dark:border-stone-700 dark:bg-stone-900"
      />
      <ul className="mt-2 space-y-2">
        {shown.map((a) => {
          const text = answerToText(a.answer);
          return (
            <li key={a.id} className="flex items-start justify-between gap-2">
              <span className="min-w-0">
                <span className="block text-xs text-stone-500">{a.question}</span>
                <span className="block break-words">{text}</span>
              </span>
              <CopyButton text={text} label={`Copy answer to ${a.question}`} />
            </li>
          );
        })}
      </ul>
    </details>
  );
}

/**
 * "Apply automatically via Lever" for an "apply on company site" link to an Auto
 * form (spec 17.1): after the user confirms, only the employer's form is queued.
 */
export function AutoViaPlatform({ job }: { job: Job }) {
  const platform = autoPlatformFor(job);
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string }>();
  if (!platform) return null;
  const queue = async () => {
    const r = await sendMessage("queue/add", { jobIds: [job.id] });
    setConfirming(false);
    setNote(
      r.queued > 0
        ? { ok: true, text: `Queued. Job Copilot will apply on ${platform}.` }
        : { ok: false, text: r.skipped[0]?.reason ?? "Not queued." },
    );
  };
  return (
    <div className="space-y-2 text-sm">
      {confirming ? (
        <div className="space-y-2 rounded-md border border-stone-200 p-3 dark:border-stone-800">
          <p>
            This adds the employer’s {platform} form to your auto-apply queue. Nothing is clicked or
            sent on this site.
          </p>
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => void queue()}>
              Queue it
            </Button>
            <Button
              onClick={() => {
                setConfirming(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          onClick={() => {
            setConfirming(true);
          }}
        >
          Apply automatically via {platform}
        </Button>
      )}
      {note && <Note ok={note.ok}>{note.text}</Note>}
    </div>
  );
}

/** Copies page diagnostics (no personal data) and opens a prefilled GitHub issue. */
export function ReportBrokenPage({ tabId }: { tabId: number }) {
  const [note, setNote] = useState<{ ok: boolean; text: string }>();
  const report = async () => {
    const r = await sendMessage("assist/diagnostics", { tabId });
    if (!r.text || !r.issueUrl) {
      setNote({ ok: false, text: r.error ?? "Could not read this page." });
      return;
    }
    await navigator.clipboard.writeText(r.text).catch(() => undefined);
    await browser.tabs.create({ url: r.issueUrl });
    setNote({
      ok: true,
      text: "Copied. The issue form opened in a new tab; it lists field names only, never your answers.",
    });
  };
  return (
    <div className="space-y-1">
      <button
        type="button"
        className="text-xs text-stone-500 underline"
        onClick={() => void report()}
      >
        Report a broken page
      </button>
      {note && <Note ok={note.ok}>{note.text}</Note>}
    </div>
  );
}
