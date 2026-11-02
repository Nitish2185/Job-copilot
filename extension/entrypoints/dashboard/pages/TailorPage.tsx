import type { JdAnalysis, Job, Profile, ResumeDocument } from "@job-copilot/shared";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Section, inputClass } from "@/components/ui/Field";
import { EmptyState, ErrorMessage, Loading } from "@/components/ui/States";
import { getDb } from "@/lib/db/db";
import { ensureDescription } from "@/lib/jobs/description";
import { sanitizeHtml } from "@/lib/jobs/sanitize";
import { sendMessage } from "@/lib/messaging/client";
import type { MessageResponse } from "@/lib/messaging/protocol";
import { loadProfile } from "@/lib/profile/store";
import { buildResumeDocument, resumeFileName } from "@/lib/resume/document";
import { makeResumePdf } from "@/lib/resume/make";
import type { FitResult } from "@/lib/resume/pdf/render";
import { RESUME_TEMPLATES, type ResumeTemplate } from "@/lib/resume/pdf/setup";
import { saveResumeVersion } from "@/lib/resume/versions";
import { loadSettings } from "@/lib/settings/settings";

type Tailored = MessageResponse<"ai/tailorResume">;
type Picks = MessageResponse<"ai/pickProjects">["picks"];

interface State {
  job: Job;
  profile: Profile;
  analysis: JdAnalysis;
  picks: Picks;
  tailored: Tailored;
  doc: ResumeDocument;
}

const bulletKey = (section: string, item: string, index: number) =>
  `${section}:${item}:${String(index)}`;

/** Changed bullets according to the tailoring result, before the user edits anything. */
function changedKeys(tailored: Tailored): Set<string> {
  const keys = new Set<string>();
  for (const e of tailored.content.experience) {
    e.bullets.forEach((b, i) => {
      if (b.changed) keys.add(bulletKey("exp", e.experienceId, i));
    });
  }
  for (const p of tailored.content.projects) {
    p.bullets.forEach((b, i) => {
      if (b.changed) keys.add(bulletKey("proj", p.projectId, i));
    });
  }
  return keys;
}

function BulletEditor({
  id,
  label,
  value,
  changed,
  edited,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  changed: boolean;
  edited: boolean;
  onChange: (text: string) => void;
}) {
  return (
    <div
      className={`rounded-md ${changed || edited ? "border-l-4 border-amber-400 bg-amber-50 pl-2 dark:bg-amber-950" : ""}`}
    >
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <textarea
        id={id}
        rows={2}
        className={inputClass}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      />
      {(changed || edited) && (
        <span className="text-xs text-amber-800 dark:text-amber-300">
          {edited ? "Edited by you" : "Reworded for this job"}
        </span>
      )}
    </div>
  );
}

/** Make, check, edit and save a resume for one job (spec 14.2). */
export function TailorPage() {
  const { id = "" } = useParams();
  const [state, setState] = useState<State>();
  const [progress, setProgress] = useState("Reading the job...");
  const [error, setError] = useState<string>();
  const [template, setTemplate] = useState<ResumeTemplate>("classic");
  const [fit, setFit] = useState<FitResult>();
  const [pdfUrl, setPdfUrl] = useState<string>();
  const [rendering, setRendering] = useState(false);
  const [edited, setEdited] = useState<ReadonlySet<string>>(new Set());
  const [savedText, setSavedText] = useState<string>();
  const started = useRef(false);

  const render = async (s: State, t: ResumeTemplate) => {
    setRendering(true);
    try {
      const result = await makeResumePdf(s.profile, s.doc, { template: t, analysis: s.analysis });
      setFit(result);
      setPdfUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(new Blob([result.bytes.slice()], { type: "application/pdf" }));
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not make the PDF.");
    } finally {
      setRendering(false);
    }
  };

  const tailor = async (base: Omit<State, "tailored" | "doc">, t: ResumeTemplate) => {
    setProgress("Tailoring your resume...");
    const tailored = await sendMessage("ai/tailorResume", {
      jobId: base.job.id,
      projectIds: base.picks.map((p) => p.projectId),
    });
    const projects = base.picks
      .map((p) => base.profile.projects.find((x) => x.id === p.projectId))
      .filter((p): p is NonNullable<typeof p> => p !== undefined);
    const doc = buildResumeDocument(base.profile, { projects, content: tailored.content });
    const next: State = { ...base, tailored, doc };
    setState(next);
    setEdited(new Set());
    setSavedText(undefined);
    setProgress("Making the PDF...");
    await render(next, t);
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const db = getDb();
        const [job, profile, settings] = await Promise.all([
          db.jobs.get(id),
          loadProfile(db),
          loadSettings(),
        ]);
        if (!job) throw new Error("This job is no longer saved on this device.");
        setTemplate(settings.tailoring.template);
        try {
          await ensureDescription(
            db,
            { fetch: (i, init) => fetch(i, init), sanitize: sanitizeHtml, now: () => new Date() },
            job,
          );
        } catch {
          // The snippet is enough to tailor; the analysis says so when it is thin.
        }
        setProgress("Reading what the job asks for...");
        const { analysis } = await sendMessage("ai/analyzeJd", { jobId: id });
        setProgress("Choosing your best projects...");
        const { picks } = await sendMessage("ai/pickProjects", { jobId: id });
        await tailor({ job, profile, analysis, picks }, settings.tailoring.template);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not make the resume.");
      }
    })();
    // Runs once per page; later changes go through the buttons.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    },
    [pdfUrl],
  );

  if (error && !state) {
    return (
      <div className="p-6">
        <ErrorMessage>{error}</ErrorMessage>
        <Link to={`/jobs/${encodeURIComponent(id)}`} className="mt-3 inline-block underline">
          Back to the job
        </Link>
      </div>
    );
  }
  if (!state) return <Loading label={progress} />;
  if (state.profile.basics.fullName.trim() === "") {
    return (
      <div className="p-6">
        <EmptyState title="Set up your profile first">
          <Link to="/onboarding" className="underline">
            Add your resume and profile
          </Link>{" "}
          so Job Copilot has something to tailor.
        </EmptyState>
      </div>
    );
  }

  const { job, profile, tailored, doc, picks } = state;
  const changed = changedKeys(tailored);
  const update = (next: ResumeDocument, key: string) => {
    setState({ ...state, doc: next });
    setEdited(new Set(edited).add(key));
    setSavedText(undefined);
  };
  const projectsById = new Map(profile.projects.map((p) => [p.id, p]));
  const fileName = resumeFileName(profile.basics.fullName, job.company.name);
  const issues = [
    ...tailored.issues,
    ...(fit && !fit.fits ? ["The resume is longer than one page even at the smallest font."] : []),
  ];

  const save = async () => {
    if (!fit) return;
    await saveResumeVersion(getDb(), {
      kind: "tailored",
      jobId: job.id,
      document: fit.document,
      pdf: fit.bytes,
      fileName,
      pickedProjectIds: picks.map((p) => p.projectId),
      keywordsTargeted: tailored.content.keywordsTargeted,
      issues,
      template,
      approvedByUser: true,
    });
    setSavedText("Saved. You can find it on the Resumes page.");
  };

  const swap = (index: number, projectId: string) => {
    const next = picks.map((p, i) =>
      i === index ? { projectId, reason: "You chose this project", matchedKeywords: [] } : p,
    );
    void tailor({ job, profile, analysis: state.analysis, picks: next }, template).catch(
      (e: unknown) => {
        setError(e instanceof Error ? e.message : "Could not tailor the resume.");
      },
    );
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-6">
      <Link
        to={`/jobs/${encodeURIComponent(job.id)}`}
        className="text-sm text-blue-700 underline dark:text-blue-400"
      >
        ← Back to the job
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          Resume for {job.title} at {job.company.name}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="template" className="text-sm">
            Template
          </label>
          <select
            id="template"
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
            value={template}
            onChange={(e) => {
              const t = e.target.value as ResumeTemplate;
              setTemplate(t);
              void render(state, t);
            }}
          >
            {RESUME_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <Button onClick={() => void render(state, template)} disabled={rendering}>
            {rendering ? "Updating..." : "Update preview"}
          </Button>
          {pdfUrl && (
            <a
              href={pdfUrl}
              download={fileName}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium dark:border-slate-700"
            >
              Download PDF
            </a>
          )}
          <Button variant="primary" onClick={() => void save()} disabled={!fit || rendering}>
            Save this resume
          </Button>
        </div>
      </div>
      {savedText && (
        <p role="status" className="text-sm text-green-700 dark:text-green-400">
          {savedText}
        </p>
      )}
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {tailored.source === "local" && (
        <p className="rounded-md bg-blue-50 p-3 text-sm text-blue-900 dark:bg-blue-950 dark:text-blue-200">
          {tailored.aiError
            ? `The AI could not tailor this resume (${tailored.aiError}). `
            : "Made without AI: "}
          your skills and bullets are put in the best order for this job; nothing is reworded.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="min-h-[70vh] rounded-md border border-slate-200 dark:border-slate-800">
          {pdfUrl ? (
            <iframe title="Resume preview" src={pdfUrl} className="h-[80vh] w-full rounded-md" />
          ) : (
            <Loading label={progress} />
          )}
          {fit && (
            <p className="p-2 text-xs text-slate-500" data-testid="fit-info">
              {String(fit.pages)} page{fit.pages === 1 ? "" : "s"}, {String(fit.fontSize)} pt
            </p>
          )}
        </div>

        <div className="space-y-4" aria-label="What changed">
          {issues.length > 0 && (
            <Section
              title="Kept as it was"
              description="These AI changes were not used, so nothing untrue gets in."
            >
              <ul className="list-disc space-y-1 pl-5 text-sm" data-testid="validation-issues">
                {issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="Summary">
            {tailored.content.summaryChanged && <Badge tone="amber">Reworded for this job</Badge>}
            <Field id="tailor-summary" label="Summary">
              <textarea
                id="tailor-summary"
                rows={4}
                className={inputClass}
                value={doc.summary}
                onChange={(e) => {
                  update({ ...doc, summary: e.target.value }, "summary");
                }}
              />
            </Field>
            {tailored.content.summaryChanged && (
              <details className="text-sm">
                <summary className="cursor-pointer text-slate-600 dark:text-slate-400">
                  Your original summary
                </summary>
                <p className="mt-1">{profile.summary}</p>
              </details>
            )}
          </Section>

          {tailored.content.skillsReordered && (
            <Section title="Skills" description="Most relevant first.">
              <p className="text-sm">{doc.skills.map((s) => s.displayName).join(", ")}</p>
            </Section>
          )}

          <Section title="Experience">
            {doc.experience.map((e, ei) => (
              <div key={e.experienceId} className="space-y-2">
                <p className="text-sm font-medium">
                  {e.title}, {e.company}
                </p>
                {e.bullets.map((b, bi) => {
                  const key = bulletKey("exp", e.experienceId, bi);
                  return (
                    <BulletEditor
                      key={key}
                      id={key}
                      label={`${e.company} bullet ${String(bi + 1)}`}
                      value={b}
                      changed={changed.has(key)}
                      edited={edited.has(key)}
                      onChange={(text) => {
                        const experience = doc.experience.map((x, xi) =>
                          xi === ei
                            ? { ...x, bullets: x.bullets.map((y, yi) => (yi === bi ? text : y)) }
                            : x,
                        );
                        update({ ...doc, experience }, key);
                      }}
                    />
                  );
                })}
              </div>
            ))}
            {fit && fit.dropped.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-slate-600 dark:text-slate-400">
                  {String(fit.dropped.length)} older bullet{fit.dropped.length === 1 ? "" : "s"}{" "}
                  left out to fit one page
                </summary>
                <ul className="mt-1 list-disc pl-5">
                  {fit.dropped.map((d) => (
                    <li key={`${d.experienceId}:${d.text}`}>{d.text}</li>
                  ))}
                </ul>
              </details>
            )}
          </Section>

          <Section title="Projects" description="Picked for this job. Swap any of them.">
            {doc.projects.map((p, pi) => {
              const pick = picks.find((x) => x.projectId === p.projectId);
              const others = profile.projects.filter(
                (x) => x.included && !picks.some((y) => y.projectId === x.id),
              );
              return (
                <div
                  key={p.projectId}
                  className="space-y-2 rounded-md border border-slate-200 p-2 dark:border-slate-800"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">{p.name}</p>
                    {others.length > 0 && (
                      <select
                        aria-label={`Swap ${p.name}`}
                        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                        value=""
                        onChange={(e) => {
                          swap(pi, e.target.value);
                        }}
                      >
                        <option value="">Swap for…</option>
                        {others.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  {pick && (
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Why: {pick.reason}
                      {pick.matchedKeywords.length > 0 && ` (${pick.matchedKeywords.join(", ")})`}
                    </p>
                  )}
                  {p.bullets.map((b, bi) => {
                    const key = bulletKey("proj", p.projectId, bi);
                    return (
                      <BulletEditor
                        key={key}
                        id={key}
                        label={`${p.name} bullet ${String(bi + 1)}`}
                        value={b}
                        changed={changed.has(key)}
                        edited={edited.has(key)}
                        onChange={(text) => {
                          const projects = doc.projects.map((x, xi) =>
                            xi === pi
                              ? { ...x, bullets: x.bullets.map((y, yi) => (yi === bi ? text : y)) }
                              : x,
                          );
                          update({ ...doc, projects }, key);
                        }}
                      />
                    );
                  })}
                  {projectsById.get(p.projectId)?.links.repo && (
                    <p className="text-xs text-slate-500">
                      {projectsById.get(p.projectId)?.links.repo}
                    </p>
                  )}
                </div>
              );
            })}
          </Section>
        </div>
      </div>
    </div>
  );
}
