import { skillDisplayName, type AiScore, type Job, type JobScore } from "@job-copilot/shared";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, ExternalLink, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { ScoreBadge } from "@/components/matching/ScoreBadge";
import { CoverLetterPanel } from "@/components/resume/CoverLetterPanel";
import { InterviewPrepPanel } from "@/components/tracker/InterviewPrepPanel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Field";
import { EmptyState, ErrorMessage, Loading } from "@/components/ui/States";
import { getDb } from "@/lib/db/db";
import { ensureDescription } from "@/lib/jobs/description";
import { sanitizeHtml } from "@/lib/jobs/sanitize";
import { sendMessage } from "@/lib/messaging/client";
import { useProfile } from "../hooks";

const FIT_TEXT: Record<AiScore["experienceFit"], string> = {
  under: "Less experience than asked",
  fit: "Experience fits",
  over: "More experience than asked",
  unknown: "Experience not stated",
};

function Checklist({ items }: { items: AiScore["mustHave"] }) {
  if (items.length === 0) return <p className="text-sm text-slate-500">None listed.</p>;
  return (
    <ul className="space-y-1 text-sm">
      {items.map((item) => (
        <li key={item.skill} className="flex items-center gap-2">
          {item.met ? (
            <Check className="size-4 text-green-600" aria-label="You have this" />
          ) : (
            <X className="size-4 text-red-600" aria-label="Missing" />
          )}
          {item.skill}
        </li>
      ))}
    </ul>
  );
}

function fitText(value: boolean | null, yes: string, no: string): string {
  if (value === null) return "Unknown";
  return value ? yes : no;
}

function Breakdown({ job, score }: { job: Job; score: JobScore | undefined }) {
  const [scoring, setScoring] = useState(false);
  const [error, setError] = useState<string>();
  if (!score) return <p className="text-sm text-slate-500">This job has not been scored yet.</p>;
  const { prefilter, ai } = score;

  const scoreWithAi = async () => {
    setScoring(true);
    setError(undefined);
    try {
      const result = await sendMessage("match/scoreNext", { count: 1, jobIds: [job.id] });
      if (result.error) setError(result.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scoring failed.");
    } finally {
      setScoring(false);
    }
  };

  return (
    <div className="space-y-3">
      {prefilter.excluded && (
        <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Hidden by your preferences: {prefilter.excluded}.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <ScoreBadge score={score} />
        {ai && <Badge tone={ai.verdict === "strong" ? "green" : "neutral"}>{ai.verdict} fit</Badge>}
        {score.isEstimate && (
          <Button onClick={() => void scoreWithAi()} disabled={scoring}>
            {scoring ? "Scoring..." : "Score with AI"}
          </Button>
        )}
      </div>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {ai ? (
        <>
          <ul className="list-disc pl-5 text-sm" aria-label="Reasons">
            {ai.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          {ai.redFlags.length > 0 && (
            <div className="text-sm">
              <p className="font-medium text-red-700 dark:text-red-400">Red flags</p>
              <ul className="list-disc pl-5">
                {ai.redFlags.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="mb-1 text-sm font-medium">Must have</h3>
              <Checklist items={ai.mustHave} />
            </div>
            <div>
              <h3 className="mb-1 text-sm font-medium">Nice to have</h3>
              <Checklist items={ai.niceToHave} />
            </div>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-slate-500">Experience</dt>
            <dd>{FIT_TEXT[ai.experienceFit]}</dd>
            <dt className="text-slate-500">Location</dt>
            <dd>{fitText(ai.locationFit, "Fits your preferences", "Does not fit")}</dd>
            <dt className="text-slate-500">Salary</dt>
            <dd>{fitText(ai.salaryFit, "Fits your expectations", "Below your expectations")}</dd>
          </dl>
        </>
      ) : (
        <ul className="list-disc pl-5 text-sm" aria-label="Reasons">
          {prefilter.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-1" aria-label="Skills">
        {prefilter.matchedSkills.map((s) => (
          <Badge key={s} tone="green">
            {skillDisplayName(s)}
          </Badge>
        ))}
        {prefilter.missingSkills.map((s) => (
          <Badge key={s}>{`Missing: ${skillDisplayName(s)}`}</Badge>
        ))}
      </div>
    </div>
  );
}

function Description({ job }: { job: Job }) {
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(!job.description);

  useEffect(() => {
    let cancelled = false;
    ensureDescription(
      getDb(),
      { fetch: (i, init) => fetch(i, init), sanitize: sanitizeHtml, now: () => new Date() },
      job,
    )
      .catch((e: unknown) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Could not load the description.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Fetch once per job; the stored description updates the page through the live query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id]);

  if (job.description) {
    return (
      <div
        className="prose-sm max-w-none space-y-2 text-sm leading-relaxed [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_a]:text-blue-700 [&_a]:underline"
        data-testid="job-description"
        // Sanitized with DOMPurify when stored and again here.
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(job.description.html) }}
      />
    );
  }
  if (loading) return <Loading label="Loading the full description..." />;
  return (
    <div className="space-y-2 text-sm">
      {error && <p className="text-slate-500">{error} Showing the short version.</p>}
      <p>{job.snippet}</p>
    </div>
  );
}

function ApplyAutomatically({ jobId }: { jobId: string }) {
  const [note, setNote] = useState<string>();
  const queue = async () => {
    const result = await sendMessage("queue/add", { jobIds: [jobId] });
    setNote(result.queued > 0 ? "Queued. Check Review for approval." : result.skipped[0]?.reason);
  };
  return (
    <span className="inline-flex flex-col">
      <Button onClick={() => void queue()}>Apply automatically</Button>
      {note && (
        <span role="status" className="mt-1 max-w-xs text-xs text-slate-600 dark:text-slate-400">
          {note}
        </span>
      )}
    </span>
  );
}

/** One job: description, match breakdown and related jobs (spec 18.1 `#/jobs/:id`). */
export function JobDetailPage() {
  const { id = "" } = useParams();
  const profile = useProfile();
  const data = useLiveQuery(async () => {
    const db = getDb();
    const job = await db.jobs.get(id);
    if (!job) return { job: undefined };
    const score = await db.scores.get(id);
    const others = job.company.token
      ? (await db.jobs.where("company.token").equals(job.company.token).toArray()).filter(
          (j) => j.id !== id && j.status !== "closed",
        )
      : [];
    const applications = await db.applications
      .where("jobId")
      .anyOf([id, ...others.map((j) => j.id)])
      .toArray();
    return { job, score, others: others.slice(0, 10), applications };
  }, [id]);

  if (!data) return <Loading />;
  const { job } = data;
  if (!job) {
    return (
      <div className="p-6">
        <EmptyState title="Job not found">
          It may have been removed. <Link to="/matches">Back to jobs</Link>
        </EmptyState>
      </div>
    );
  }
  const ownPrep = data.applications.find((a) => a.jobId === job.id)?.interviewPrep;
  const setStatus = (status: "saved" | "hidden") =>
    void sendMessage("jobs/setStatus", { ids: [job.id], status });

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <Link to="/matches" className="text-sm text-blue-700 underline dark:text-blue-400">
        ← Back to jobs
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{job.title}</h1>
          <p className="text-slate-600 dark:text-slate-400">
            {job.company.name} · {job.locations.join("; ") || "Location not listed"}
            {job.remote === "remote" && " · Remote"}
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            <Badge tone={job.mode === "auto" ? "green" : "blue"}>
              {job.mode === "auto" ? "Auto" : "Assist"}
            </Badge>
            {job.status !== "new" && <Badge tone="amber">{job.status}</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {job.mode === "auto" && <ApplyAutomatically jobId={job.id} />}
          <Link
            to={`/jobs/${encodeURIComponent(job.id)}/resume`}
            className="inline-flex items-center rounded-md border border-blue-600 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950"
          >
            Make a resume for this job
          </Link>
          {job.url && (
            <a
              href={job.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Open job page <ExternalLink className="size-4" aria-hidden />
            </a>
          )}
          <Button
            onClick={() => {
              setStatus("saved");
            }}
          >
            Save
          </Button>
          <Button
            onClick={() => {
              setStatus("hidden");
            }}
          >
            Hide
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Section title="Description">
          <Description job={job} />
        </Section>
        <div className="space-y-4">
          <Section title="How well it fits">
            <Breakdown job={job} score={data.score} />
          </Section>
          {profile && (
            <Section title="Cover letter">
              <CoverLetterPanel job={job} profile={profile} />
            </Section>
          )}
          {profile && (
            <Section title="Interview">
              <InterviewPrepPanel
                key={job.id}
                jobId={job.id}
                {...(ownPrep && { saved: ownPrep })}
              />
            </Section>
          )}
          <Section title={`More at ${job.company.name}`}>
            {data.applications.length > 0 && (
              <p className="text-sm">
                You applied here {String(data.applications.length)} time
                {data.applications.length === 1 ? "" : "s"} before.
              </p>
            )}
            {data.others.length > 0 ? (
              <ul className="space-y-1 text-sm">
                {data.others.map((other) => (
                  <li key={other.id}>
                    <Link
                      to={`/jobs/${encodeURIComponent(other.id)}`}
                      className="text-blue-700 underline dark:text-blue-400"
                    >
                      {other.title}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No other open jobs here.</p>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
