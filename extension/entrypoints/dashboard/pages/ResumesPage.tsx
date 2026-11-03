import type { ResumeVersion } from "@job-copilot/shared";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Field";
import { EmptyState, ErrorMessage, Loading } from "@/components/ui/States";
import { getDb } from "@/lib/db/db";
import { baseProjects, buildResumeDocument, resumeFileName } from "@/lib/resume/document";
import { makeResumePdf } from "@/lib/resume/make";
import { RESUME_TEMPLATES, type ResumeTemplate } from "@/lib/resume/pdf/setup";
import { deleteResumeVersion, saveResumeVersion } from "@/lib/resume/versions";
import { openStoredFile } from "@/lib/files/open";
import { loadSettings, updateSettings } from "@/lib/settings/settings";
import { useProfile } from "../hooks";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Base resume, generated base resume and tailored versions (spec 18.1 `#/resumes`). */
export function ResumesPage() {
  const profile = useProfile();
  const data = useLiveQuery(async () => {
    const db = getDb();
    const versions = await db.resumeVersions.orderBy("createdAt").reverse().toArray();
    const jobs = await db.jobs.bulkGet([
      ...new Set(versions.map((v) => v.jobId).filter((id): id is string => id !== undefined)),
    ]);
    return {
      generated: versions.find((v) => v.kind === "base_generated"),
      tailored: versions.filter((v) => v.kind === "tailored"),
      jobs: new Map(jobs.filter((j) => j !== undefined).map((j) => [j.id, j])),
    };
  }, []);
  const [settings, setSettings] = useState<{
    template: ResumeTemplate;
    base: "uploaded" | "generated";
  }>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();

  useEffect(() => {
    void loadSettings().then((s) => {
      setSettings({ template: s.tailoring.template, base: s.tailoring.baseResume });
    });
  }, []);

  if (!profile || !data || !settings) return <Loading />;

  const generate = async () => {
    setBusy(true);
    setMessage(undefined);
    try {
      const doc = buildResumeDocument(profile, { projects: baseProjects(profile) });
      const result = await makeResumePdf(profile, doc, { template: settings.template });
      await saveResumeVersion(getDb(), {
        kind: "base_generated",
        document: result.document,
        pdf: result.bytes,
        fileName: resumeFileName(profile.basics.fullName),
        pickedProjectIds: doc.projects.map((p) => p.projectId),
        keywordsTargeted: [],
        issues: result.fits ? [] : ["Longer than one page even at the smallest font."],
        template: settings.template,
        approvedByUser: true,
      });
      setMessage({ ok: true, text: "A clean resume was made from your profile." });
    } catch (e) {
      setMessage({
        ok: false,
        text: e instanceof Error ? e.message : "Could not make the resume.",
      });
    } finally {
      setBusy(false);
    }
  };

  const choose = async (patch: Partial<typeof settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    await updateSettings({ tailoring: { template: next.template, baseResume: next.base } });
  };

  const remove = async (version: ResumeVersion) => {
    const removed = await deleteResumeVersion(getDb(), version.id);
    if (!removed) {
      setMessage({ ok: false, text: "This resume was sent with an application, so it is kept." });
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Resumes</h1>
      {message &&
        (message.ok ? (
          <p role="status" className="text-sm text-green-700 dark:text-green-400">
            {message.text}
          </p>
        ) : (
          <ErrorMessage>{message.text}</ErrorMessage>
        ))}

      <Section
        title="Your base resume"
        description="Used when you apply “with my resume”. A clean version made from your profile is easier for applicant tracking systems to read."
      >
        <fieldset className="space-y-2 text-sm">
          <legend className="sr-only">Base resume</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="base-resume"
              checked={settings.base === "uploaded"}
              disabled={!profile.baseResume}
              onChange={() => void choose({ base: "uploaded" })}
            />
            Uploaded:{" "}
            {profile.baseResume
              ? `${profile.baseResume.fileName} (${formatDate(profile.baseResume.uploadedAt)})`
              : "none yet"}
            {profile.baseResume && (
              <Button
                variant="ghost"
                onClick={() => {
                  if (profile.baseResume)
                    void openStoredFile(profile.baseResume.fileId, "download");
                }}
              >
                Download
              </Button>
            )}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="base-resume"
              checked={settings.base === "generated"}
              disabled={!data.generated}
              onChange={() => void choose({ base: "generated" })}
            />
            Made from my profile:{" "}
            {data.generated ? formatDate(data.generated.createdAt) : "not made yet"}
            {data.generated && (
              <Button
                variant="ghost"
                onClick={() => {
                  if (data.generated) void openStoredFile(data.generated.fileId, "download");
                }}
              >
                Download
              </Button>
            )}
          </label>
        </fieldset>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void generate()} disabled={busy || profile.basics.fullName === ""}>
            {busy
              ? "Making..."
              : data.generated
                ? "Make it again from my profile"
                : "Generate a clean base resume from my profile"}
          </Button>
          <label htmlFor="resume-template" className="text-sm">
            Template
          </label>
          <select
            id="resume-template"
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
            value={settings.template}
            onChange={(e) => void choose({ template: e.target.value as ResumeTemplate })}
          >
            {RESUME_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </Section>

      <Section title="Made for a job">
        {data.tailored.length === 0 ? (
          <EmptyState title="No tailored resumes yet">
            Open a job and choose “Make a resume for this job”.
          </EmptyState>
        ) : (
          <ul
            className="divide-y divide-slate-200 dark:divide-slate-800"
            data-testid="tailored-list"
          >
            {data.tailored.map((v) => {
              const job = v.jobId ? data.jobs.get(v.jobId) : undefined;
              return (
                <li key={v.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    {job ? (
                      <Link
                        to={`/jobs/${encodeURIComponent(job.id)}`}
                        className="font-medium underline"
                      >
                        {job.title} at {job.company.name}
                      </Link>
                    ) : (
                      <span className="font-medium">A job that is no longer saved</span>
                    )}
                    <span className="ml-2 text-slate-500">{formatDate(v.createdAt)}</span>
                  </div>
                  {v.validation.passed ? (
                    <Badge tone="green">Checked</Badge>
                  ) : (
                    <Badge tone="amber">
                      {`${String(v.validation.issues.length)} change${v.validation.issues.length === 1 ? "" : "s"} kept as before`}
                    </Badge>
                  )}
                  <Button variant="ghost" onClick={() => void openStoredFile(v.fileId, "preview")}>
                    Preview
                  </Button>
                  <Button variant="ghost" onClick={() => void openStoredFile(v.fileId, "download")}>
                    Download
                  </Button>
                  <Button variant="ghost" onClick={() => void remove(v)}>
                    Delete
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}
