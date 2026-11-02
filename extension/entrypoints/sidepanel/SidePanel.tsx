/**
 * Side panel (spec 16.6, 18.2). On a job or apply page: the match, the two
 * resume choices, the cover letter, Autofill, "Did you submit?" or "Mark as
 * applied", saved answers and "Report a broken page". On other pages: "Save
 * this job". Always: today's top matches, the Needs-you count and quick links.
 */
import { skillDisplayName } from "@job-copilot/shared";
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useState } from "react";
import { browser } from "wxt/browser";
import { ScoreBadge } from "@/components/matching/ScoreBadge";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ErrorMessage } from "@/components/ui/States";
import { getDb } from "@/lib/db/db";
import { sendMessage } from "@/lib/messaging/client";
import type { AutofillReportMessage, MessageResponse } from "@/lib/messaging/protocol";
import {
  AutoViaPlatform,
  CopyButton,
  ReportBrokenPage,
  SaveJobButton,
  SavedAnswers,
  SubmittedPrompt,
} from "./PagePanels";

type PageInfo = MessageResponse<"apply/pageInfo">;

function openDashboard(hash: string): void {
  void browser.tabs.create({ url: `${browser.runtime.getURL("/dashboard.html")}${hash}` });
}

async function activeTabId(): Promise<number | undefined> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

function useShortcut(): string {
  const [shortcut, setShortcut] = useState("");
  useEffect(() => {
    void browser.commands.getAll().then((commands) => {
      setShortcut(commands.find((c) => c.name === "autofill")?.shortcut ?? "");
    });
  }, []);
  return shortcut;
}

function ReportSummary({ report }: { report: AutofillReportMessage }) {
  const filled = report.fields.filter((f) => f.status === "filled");
  const needsYou = report.fields.filter((f) => f.status === "needs_you" || f.status === "error");
  return (
    <div className="space-y-1 text-sm" data-testid="autofill-summary">
      <p>
        Filled {String(filled.length)} field{filled.length === 1 ? "" : "s"}
        {needsYou.length > 0 && `; ${String(needsYou.length)} need you`}.
      </p>
      {needsYou.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-amber-800 dark:text-amber-300">
          {needsYou.map((f) => (
            <li key={f.id}>
              <span className="font-medium">{f.label || f.key}</span>
              {f.note && <span className="block text-xs">{f.note}</span>}
            </li>
          ))}
        </ul>
      )}
      {report.loginForm && (
        <p className="text-amber-800">
          This looks like a login form. Log in yourself, then press Autofill again.
        </p>
      )}
      {report.captcha && (
        <p className="text-amber-800">Please solve the CAPTCHA on the page yourself.</p>
      )}
    </div>
  );
}

function JobCard({
  jobId,
  adapterId,
  tabId,
  report,
}: {
  jobId: string;
  adapterId?: string;
  tabId: number;
  report?: AutofillReportMessage;
}) {
  const data = useLiveQuery(async () => {
    const db = getDb();
    const [job, score, versions, letter, application] = await Promise.all([
      db.jobs.get(jobId),
      db.scores.get(jobId),
      db.resumeVersions.where("jobId").equals(jobId).toArray(),
      db.coverLetters.where("jobId").equals(jobId).first(),
      db.applications.where("jobId").equals(jobId).first(),
    ]);
    return {
      job,
      score,
      hasTailored: versions.some((v) => v.kind === "tailored"),
      letter,
      application,
    };
  }, [jobId]);
  const [choice, setChoice] = useState<"current" | "tailored">("current");
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  if (!data?.job) return null;
  const { job, score, hasTailored, letter, application } = data;
  const naukri = adapterId === "naukri";
  const reasons = score?.ai?.reasons ?? score?.prefilter.reasons ?? [];

  const markApplied = async () => {
    const r = await sendMessage("apply/markApplied", { tabId, resumeChoice: choice });
    setMessage(
      r.created
        ? { ok: true, text: "Saved to your applications." }
        : { ok: false, text: r.error ?? "Not saved." },
    );
  };

  return (
    <section className="space-y-3" aria-label="This job">
      <div className="flex items-start gap-3">
        <ScoreBadge score={score} />
        <div className="min-w-0">
          <h2 className="font-semibold">{job.title}</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">{job.company.name}</p>
        </div>
      </div>
      {reasons.length > 0 && (
        <ul className="list-disc pl-5 text-sm">
          {reasons.slice(0, 3).map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {score && score.prefilter.missingSkills.length > 0 && (
        <p className="flex flex-wrap gap-1 text-xs">
          {score.prefilter.missingSkills.slice(0, 6).map((s) => (
            <Badge key={s}>{`Missing: ${skillDisplayName(s)}`}</Badge>
          ))}
        </p>
      )}
      <fieldset className="space-y-1 text-sm">
        <legend className="mb-1 font-medium">Resume</legend>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="resume"
            checked={choice === "current"}
            onChange={() => {
              setChoice("current");
            }}
          />
          Apply with my resume
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="resume"
            disabled={naukri || !hasTailored}
            checked={choice === "tailored"}
            onChange={() => {
              setChoice("tailored");
            }}
          />
          Apply with a resume made for this job
        </label>
        {naukri ? (
          <p className="text-xs text-slate-500">
            Tailored resume isn’t available on Naukri: it applies with your Naukri profile resume.
          </p>
        ) : (
          !hasTailored && (
            <button
              type="button"
              className="text-xs text-blue-700 underline"
              onClick={() => {
                openDashboard(`#/jobs/${encodeURIComponent(job.id)}/resume`);
              }}
            >
              Make a resume for this job
            </button>
          )
        )}
      </fieldset>
      <AutofillButton tabId={tabId} resumeChoice={choice} />
      {report && <ReportSummary report={report} />}
      {letter && (
        <div className="space-y-1 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-medium">Cover letter</span>
            <CopyButton text={letter.text} label="Copy cover letter" />
          </div>
          <p className="max-h-32 overflow-auto whitespace-pre-wrap rounded border border-slate-200 p-2 text-xs dark:border-slate-800">
            {letter.text}
          </p>
        </div>
      )}
      {application ? (
        <p className="text-sm text-green-700 dark:text-green-400">You applied to this job.</p>
      ) : report ? (
        <SubmittedPrompt tabId={tabId} resumeChoice={choice} />
      ) : (
        <Button variant="primary" onClick={() => void markApplied()}>
          Mark as applied
        </Button>
      )}
      {!application && <AutoViaPlatform job={job} />}
      {message &&
        (message.ok ? (
          <p role="status" className="text-sm text-green-700">
            {message.text}
          </p>
        ) : (
          <ErrorMessage>{message.text}</ErrorMessage>
        ))}
      <SavedAnswers />
      <ReportBrokenPage tabId={tabId} />
    </section>
  );
}

function AutofillButton({
  tabId,
  resumeChoice,
}: {
  tabId: number;
  resumeChoice: "current" | "tailored";
}) {
  const shortcut = useShortcut();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const run = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const r = await sendMessage("apply/autofillTab", { tabId, resumeChoice });
      if (r.error) {
        setError(
          `Job Copilot can't reach this page from the panel. Press ${shortcut || "the Autofill shortcut"} on the page, or right-click and choose "Autofill this form".`,
        );
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-1">
      <Button variant="primary" onClick={() => void run()} disabled={busy}>
        {busy ? "Filling..." : "Autofill"}
      </Button>
      {shortcut && (
        <p className="text-xs text-slate-500">
          Shortcut: {shortcut}. You review and press the site’s buttons yourself.
        </p>
      )}
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </div>
  );
}

function Overview() {
  const data = useLiveQuery(async () => {
    const db = getDb();
    const top = await db.scores
      .orderBy("final")
      .reverse()
      .filter((s) => !s.prefilter.excluded)
      .limit(30)
      .toArray();
    const jobs = await db.jobs.bulkGet(top.map((s) => s.jobId));
    const open = top
      .map((s, i) => ({ score: s, job: jobs[i] }))
      .filter((r) => r.job && (r.job.status === "new" || r.job.status === "saved"))
      .slice(0, 5);
    const needsYou = await db.applications.where("status").equals("needs_you").count();
    return { open, needsYou };
  }, []);
  return (
    <section className="space-y-3" aria-label="Today">
      <h2 className="font-semibold">Top matches</h2>
      {data?.open.length === 0 && <p className="text-sm text-slate-500">No ranked jobs yet.</p>}
      <ul className="space-y-2">
        {data?.open.map(({ job, score }) =>
          job ? (
            <li key={job.id} className="flex items-center gap-2 text-sm">
              <ScoreBadge score={score} />
              <button
                type="button"
                className="min-w-0 text-left hover:underline"
                onClick={() => {
                  openDashboard(`#/jobs/${encodeURIComponent(job.id)}`);
                }}
              >
                <span className="block truncate font-medium">{job.title}</span>
                <span className="block truncate text-xs text-slate-500">{job.company.name}</span>
              </button>
            </li>
          ) : null,
        )}
      </ul>
      {data && data.needsYou > 0 && (
        <p className="text-sm text-amber-800">{String(data.needsYou)} application(s) need you.</p>
      )}
      <div className="flex flex-wrap gap-2 text-sm">
        <Button
          variant="ghost"
          onClick={() => {
            openDashboard("#/matches");
          }}
        >
          All jobs
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            openDashboard("#/profile");
          }}
        >
          Profile
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            openDashboard("#/resumes");
          }}
        >
          Resumes
        </Button>
      </div>
    </section>
  );
}

export function SidePanel() {
  const [tabId, setTabId] = useState<number>();
  const [info, setInfo] = useState<PageInfo>();
  const [report, setReport] = useState<AutofillReportMessage>();

  const refresh = useCallback(async () => {
    const id = await activeTabId();
    setTabId(id);
    if (id === undefined) return;
    const [page, last] = await Promise.all([
      sendMessage("apply/pageInfo", { tabId: id }),
      sendMessage("apply/lastReport", { tabId: id }),
    ]);
    setInfo(page);
    setReport(last.report);
  }, []);

  useEffect(() => {
    const onChange = () => void refresh();
    // The first load runs after the render, like every later change.
    queueMicrotask(onChange);
    browser.tabs.onActivated.addListener(onChange);
    browser.tabs.onUpdated.addListener(onChange);
    browser.storage.onChanged.addListener(onChange);
    return () => {
      browser.tabs.onActivated.removeListener(onChange);
      browser.tabs.onUpdated.removeListener(onChange);
      browser.storage.onChanged.removeListener(onChange);
    };
  }, [refresh]);

  return (
    <main className="min-h-screen space-y-5 bg-white p-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <h1 className="text-lg font-semibold">Job Copilot</h1>
      {tabId !== undefined && info?.jobId ? (
        <JobCard
          jobId={info.jobId}
          tabId={tabId}
          report={report}
          {...(info.adapterId && { adapterId: info.adapterId })}
        />
      ) : (
        tabId !== undefined && (
          <section className="space-y-2 text-sm" aria-label="This page">
            <p className="text-slate-600 dark:text-slate-400">
              {info?.url
                ? "This page is not a job saved in Job Copilot."
                : "Job Copilot can read this page after you press Autofill on it."}
            </p>
            <SaveJobButton tabId={tabId} onSaved={() => void refresh()} />
            <AutofillButton tabId={tabId} resumeChoice="current" />
            {report && <ReportSummary report={report} />}
            <SavedAnswers />
            <ReportBrokenPage tabId={tabId} />
          </section>
        )
      )}
      <Overview />
    </main>
  );
}
