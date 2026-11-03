import type { Application, ApplicationStage, Contact } from "@job-copilot/shared";
import { useLiveQuery } from "dexie-react-hooks";
import { Dialog } from "radix-ui";
import { useState, type ReactNode, type SyntheticEvent } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { answerToText } from "@/lib/answers/answerBank";
import { getDb } from "@/lib/db/db";
import { openStoredFile } from "@/lib/files/open";
import { recordEvent, setStage, updateDetails } from "@/lib/tracker/store";
import {
  STAGES,
  STAGE_LABELS,
  followUpDate,
  followUpDue,
  stageLabel,
  suggestGhosted,
} from "@/lib/tracker/tracker";

const EVENT_LABELS: Record<string, string> = {
  submitted: "Submitted",
  stage: "Stage changed",
  follow_up_done: "Followed up",
  ghosted_dismissed: "Kept waiting",
  confirmation: "Confirmation",
};

function when(value: string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Contacts({ appId, contacts }: { appId: string; contacts: Contact[] }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const add = (e: SyntheticEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const contact: Contact = {
      name: name.trim(),
      ...(email.trim() && { email: email.trim() }),
      ...(role.trim() && { role: role.trim() }),
    };
    void updateDetails(getDb(), appId, { contacts: [...contacts, contact] });
    setName("");
    setEmail("");
    setRole("");
  };
  return (
    <Block title="Contacts">
      {contacts.length > 0 && (
        <ul className="space-y-1 text-sm">
          {contacts.map((c, i) => (
            <li key={`${c.name}-${String(i)}`} className="flex items-center justify-between gap-2">
              <span>
                {c.name}
                {c.role && <span className="text-stone-500"> · {c.role}</span>}
                {c.email && <span className="block text-xs text-stone-500">{c.email}</span>}
              </span>
              <Button
                variant="ghost"
                aria-label={`Remove ${c.name}`}
                onClick={() => {
                  void updateDetails(getDb(), appId, {
                    contacts: contacts.filter((_, j) => j !== i),
                  });
                }}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="grid grid-cols-3 gap-2">
        <input
          aria-label="Contact name"
          placeholder="Name"
          className={inputClass}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
        />
        <input
          aria-label="Contact email"
          placeholder="Email"
          type="email"
          className={inputClass}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
        />
        <input
          aria-label="Contact role"
          placeholder="Role"
          className={inputClass}
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
          }}
        />
        <Button type="submit" className="col-span-3 justify-self-start">
          Add contact
        </Button>
      </form>
    </Block>
  );
}

function InterviewDates({ appId, dates }: { appId: string; dates: string[] }) {
  const [value, setValue] = useState("");
  return (
    <Block title="Interviews">
      {dates.length > 0 && (
        <ul className="space-y-1 text-sm">
          {dates.map((d) => (
            <li key={d} className="flex items-center justify-between">
              {when(d)}
              <Button
                variant="ghost"
                aria-label={`Remove interview on ${when(d)}`}
                onClick={() => {
                  void updateDetails(getDb(), appId, {
                    interviewDates: dates.filter((x) => x !== d),
                  });
                }}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const t = Date.parse(value);
          if (Number.isNaN(t)) return;
          const at = new Date(t).toISOString().replace(/\.\d{3}Z$/, "Z");
          void updateDetails(getDb(), appId, { interviewDates: [...dates, at].sort() });
          setValue("");
        }}
      >
        <input
          type="datetime-local"
          aria-label="Interview date and time"
          className={inputClass}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
          }}
        />
        <Button type="submit">Add</Button>
      </form>
    </Block>
  );
}

/** Application drawer (spec 18.1): everything about one application, editable where it is the user's. */
export function ApplicationDrawer({
  appId,
  followUpDays,
  ghostedAfterDays,
  onClose,
  extra,
}: {
  appId: string | undefined;
  followUpDays: number;
  ghostedAfterDays: number;
  onClose: () => void;
  /** More panels for the application (follow-up email, interview prep). */
  extra?: (app: Application) => ReactNode;
}) {
  const data = useLiveQuery(async () => {
    if (!appId) return null;
    const db = getDb();
    const app = await db.applications.get(appId);
    if (!app) return null;
    const [job, version, letter, profile] = await Promise.all([
      db.jobs.get(app.jobId),
      app.resumeVersionId ? db.resumeVersions.get(app.resumeVersionId) : undefined,
      app.coverLetterId ? db.coverLetters.get(app.coverLetterId) : undefined,
      db.profile.get("me"),
    ]);
    return { app, job, version, letter, baseResume: profile?.baseResume };
  }, [appId]);
  const [notes, setNotes] = useState<{ id: string; text: string }>();

  const now = new Date();
  const app = data?.app;
  const noteText = notes && notes.id === appId ? notes.text : (app?.notes ?? "");
  const resumeFileId = data?.version?.fileId ?? data?.baseResume?.fileId;
  const due = app ? followUpDate(app, followUpDays) : undefined;

  return (
    <Dialog.Root
      open={appId !== undefined}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30" />
        <Dialog.Content className="fixed inset-y-0 right-0 w-[min(32rem,100vw)] space-y-5 overflow-y-auto bg-white p-5 text-sm shadow-xl dark:bg-stone-900">
          {app ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Dialog.Title className="text-lg font-semibold">
                    {data.job?.title ?? "Application"}
                  </Dialog.Title>
                  <Dialog.Description className="text-stone-600 dark:text-stone-400">
                    {data.job?.company.name}
                    {app.submittedAt && ` · applied ${when(app.submittedAt)}`}
                  </Dialog.Description>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <Badge tone={app.mode === "auto" ? "blue" : "neutral"}>
                      {app.mode === "auto" ? "Auto" : "Assist"}
                    </Badge>
                    {data.job && (
                      <a
                        className="text-xs text-brand-700 underline dark:text-brand-400"
                        href={`#/jobs/${encodeURIComponent(data.job.id)}`}
                      >
                        Job details
                      </a>
                    )}
                    {data.job?.url && (
                      <a
                        className="text-xs text-brand-700 underline dark:text-brand-400"
                        href={data.job.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open job page
                      </a>
                    )}
                  </div>
                </div>
                <Dialog.Close asChild>
                  <Button variant="ghost" aria-label="Close">
                    ✕
                  </Button>
                </Dialog.Close>
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">
                  Stage
                </span>
                <select
                  className={inputClass}
                  value={app.stage}
                  onChange={(e) => {
                    void setStage(getDb(), app.id, e.target.value as ApplicationStage);
                  }}
                >
                  {STAGES.map((s) => (
                    <option key={s} value={s}>
                      {STAGE_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>

              {followUpDue(app, followUpDays, now) && (
                <div
                  role="status"
                  className="space-y-2 rounded-md bg-amber-50 p-3 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                >
                  <p>No reply yet: a short follow-up message is due.</p>
                  <Button onClick={() => void recordEvent(getDb(), app.id, "follow_up_done")}>
                    I followed up
                  </Button>
                </div>
              )}
              {suggestGhosted(app, ghostedAfterDays, now) && (
                <div
                  role="status"
                  className="space-y-2 rounded-md bg-stone-100 p-3 dark:bg-stone-800"
                >
                  <p>
                    No reply for {String(ghostedAfterDays)} days or more. Mark this application as
                    ghosted?
                  </p>
                  <div className="flex gap-2">
                    <Button onClick={() => void setStage(getDb(), app.id, "ghosted")}>
                      Mark as ghosted
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => void recordEvent(getDb(), app.id, "ghosted_dismissed")}
                    >
                      Keep waiting
                    </Button>
                  </div>
                </div>
              )}
              {extra?.(app)}

              <Block title="Follow-up date">
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    aria-label="Follow-up date"
                    className={inputClass}
                    value={due ? due.toISOString().slice(0, 10) : ""}
                    onChange={(e) => {
                      const value = e.target.value;
                      void updateDetails(getDb(), app.id, {
                        followUpAt: value ? `${value}T09:00:00Z` : null,
                      });
                    }}
                  />
                  {app.followUpAt && (
                    <Button
                      variant="ghost"
                      onClick={() => void updateDetails(getDb(), app.id, { followUpAt: null })}
                    >
                      Reset
                    </Button>
                  )}
                </div>
              </Block>

              <InterviewDates appId={app.id} dates={app.interviewDates ?? []} />
              <Contacts appId={app.id} contacts={app.contacts ?? []} />

              <Block title="Notes">
                <textarea
                  aria-label="Notes"
                  rows={4}
                  className={inputClass}
                  value={noteText}
                  onChange={(e) => {
                    setNotes({ id: app.id, text: e.target.value });
                  }}
                  onBlur={() => {
                    if (noteText !== app.notes)
                      void updateDetails(getDb(), app.id, { notes: noteText });
                  }}
                />
              </Block>

              <Block title="Resume">
                <p>
                  {app.resumeChoice === "tailored" ? "A resume made for this job" : "Your resume"}
                </p>
                {resumeFileId && (
                  <Button onClick={() => void openStoredFile(resumeFileId, "preview")}>
                    Open the PDF
                  </Button>
                )}
              </Block>

              {data.letter && (
                <Block title="Cover letter">
                  <p className="max-h-40 overflow-auto rounded border border-stone-200 p-2 text-xs whitespace-pre-wrap dark:border-stone-800">
                    {data.letter.text}
                  </p>
                </Block>
              )}

              <Block title={`Answers sent (${String(app.answersSent.length)})`}>
                {app.answersSent.length === 0 ? (
                  <p className="text-stone-500">No answers were recorded.</p>
                ) : (
                  <dl className="space-y-1">
                    {app.answersSent.map((a, i) => (
                      <div key={`${a.question}-${String(i)}`}>
                        <dt className="text-xs text-stone-500">
                          {a.question}
                          {a.source === "ai" && " (AI)"}
                        </dt>
                        <dd>{answerToText(a.answer)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </Block>

              <Block title="Timeline">
                <ol className="space-y-1 border-l border-stone-200 pl-3 dark:border-stone-700">
                  {[...app.events].reverse().map((e, i) => (
                    <li key={`${e.at}-${String(i)}`}>
                      <span className="text-xs text-stone-500">{when(e.at)}</span>
                      <span className="block">
                        {EVENT_LABELS[e.type] ?? e.type}
                        {e.detail && (
                          <span className="text-stone-500">
                            {" "}
                            · {e.type === "stage" ? stageChange(e.detail) : e.detail}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ol>
              </Block>
            </>
          ) : (
            <Dialog.Title className="text-lg font-semibold">
              {data === null ? "Application not found" : "Loading..."}
            </Dialog.Title>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function stageChange(detail: string): string {
  return detail.split(" -> ").map(stageLabel).join(" → ");
}
