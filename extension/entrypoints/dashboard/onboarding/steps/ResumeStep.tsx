import type { Profile } from "@job-copilot/shared";
import { useState } from "react";
import { ProfileEditor } from "@/components/profile/ProfileEditor";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { ErrorMessage, Loading } from "@/components/ui/States";
import { extractContacts, type ExtractedContacts } from "@/lib/ai/redact";
import type { ProfileDraft } from "@/lib/ai/tasks/extractProfile";
import { getDb } from "@/lib/db/db";
import { sendMessage } from "@/lib/messaging/client";
import { profileFromDraft } from "@/lib/profile/profile";
import { saveBaseResume } from "@/lib/profile/store";
import { extractResumeText } from "@/lib/resume/extract";
import { guessFullName } from "@/lib/resume/guessName";
import { StepFooter, type StepProps } from "../StepFooter";
import { useAiConfigured, useProfile } from "../../hooks";

const EMPTY_DRAFT: ProfileDraft = {
  summary: "",
  skills: [],
  experience: [],
  education: [],
  projects: [],
  certifications: [],
  languages: [],
  achievements: [],
  uncertainFields: [],
};

type Phase =
  | { kind: "upload" }
  | {
      kind: "confirm";
      file: File;
      text: string;
      warning?: string;
      contacts: ExtractedContacts;
      name: string;
    }
  | {
      kind: "edit";
      file?: File;
      text: string;
      profile: Profile;
      uncertain: string[];
      sideBySide: boolean;
    };

function ContactsFound({ contacts }: { contacts: ExtractedContacts }) {
  const items = [
    ...contacts.emails,
    ...contacts.phones,
    contacts.linkedinUrl,
    contacts.githubUsername && `github.com/${contacts.githubUsername}`,
    ...contacts.portfolioUrls,
  ].filter((v): v is string => Boolean(v));
  if (items.length === 0) return null;
  return (
    <div className="text-sm">
      <p className="font-medium">
        Found on your resume (kept on this device, never sent to the AI):
      </p>
      <ul className="mt-1 list-disc pl-5 text-stone-600 dark:text-stone-400">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

/** Step 3: resume upload, local extraction, AI or manual profile (spec 10, step 3). */
export function ResumeStep({ next, back }: StepProps) {
  const saved = useProfile();
  const aiConfigured = useAiConfigured();
  const [phase, setPhase] = useState<Phase>();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  if (!saved) return <Loading />;
  const current: Phase =
    phase ??
    (saved.basics.fullName
      ? {
          kind: "edit",
          text: saved.baseResume?.extractedText ?? "",
          profile: saved,
          uncertain: [],
          sideBySide: false,
        }
      : { kind: "upload" });

  const onFile = async (file: File) => {
    setError(undefined);
    setBusy("Reading your resume...");
    try {
      const { text, warning } = await extractResumeText(file);
      setPhase({
        kind: "confirm",
        file,
        text,
        ...(warning && { warning }),
        contacts: extractContacts(text),
        name: guessFullName(text) ?? "",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that file.");
    } finally {
      setBusy(undefined);
    }
  };

  const build = async (confirm: Extract<Phase, { kind: "confirm" }>, useAi: boolean) => {
    const base: Profile = { ...saved, basics: { ...saved.basics, fullName: confirm.name.trim() } };
    const edit = (draft: ProfileDraft, sideBySide: boolean) => {
      setPhase({
        kind: "edit",
        file: confirm.file,
        text: confirm.text,
        profile: profileFromDraft(draft, confirm.contacts, new Date(), base),
        uncertain: draft.uncertainFields,
        sideBySide,
      });
    };
    if (!useAi) {
      edit(EMPTY_DRAFT, true);
      return;
    }
    setError(undefined);
    setBusy("The AI is reading your resume. This can take up to a minute...");
    try {
      const { draft } = await sendMessage("ai/extractProfile", {
        resumeText: confirm.text,
        fullName: confirm.name.trim(),
      });
      edit(draft, false);
    } catch (e) {
      setError(
        `The AI could not read your resume (${e instanceof Error ? e.message : "unknown error"}). You can fill in your profile by hand instead.`,
      );
    } finally {
      setBusy(undefined);
    }
  };

  if (busy) return <Loading label={busy} />;

  if (current.kind === "upload") {
    return (
      <div className="space-y-4">
        <Field id="resume-file" label="Your resume (PDF or DOCX, up to 5 MB)">
          <input
            id="resume-file"
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="block text-sm"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFile(file);
            }}
          />
        </Field>
        {error && <ErrorMessage>{error}</ErrorMessage>}
        <StepFooter back={back}>
          <Button
            variant="ghost"
            onClick={() => {
              setPhase({
                kind: "edit",
                text: "",
                profile: saved,
                uncertain: [],
                sideBySide: false,
              });
            }}
          >
            Fill in by hand without a resume
          </Button>
        </StepFooter>
      </div>
    );
  }

  if (current.kind === "confirm") {
    return (
      <div className="space-y-4">
        {current.warning && <ErrorMessage>{current.warning}</ErrorMessage>}
        <Field
          id="resume-name"
          label="Your full name"
          hint="Removed from your resume text before anything is sent to the AI."
        >
          <input
            id="resume-name"
            className={inputClass}
            value={current.name}
            onChange={(e) => {
              setPhase({ ...current, name: e.target.value });
            }}
          />
        </Field>
        <ContactsFound contacts={current.contacts} />
        {error && <ErrorMessage>{error}</ErrorMessage>}
        <StepFooter
          back={() => {
            setPhase({ kind: "upload" });
          }}
        >
          <Button onClick={() => void build(current, false)}>Fill in by hand</Button>
          {aiConfigured && (
            <Button
              variant="primary"
              disabled={current.name.trim() === ""}
              onClick={() => void build(current, true)}
            >
              Read my resume with AI
            </Button>
          )}
        </StepFooter>
      </div>
    );
  }

  const { file, text } = current;
  const editor = (
    <ProfileEditor
      key={current.profile.updatedAt + String(current.uncertain.length)}
      profile={current.profile}
      uncertainFields={current.uncertain}
      submitLabel="Confirm and continue"
      beforeSave={
        file
          ? (profile) =>
              saveBaseResume(
                getDb(),
                { name: file.name, type: file.type, blob: file },
                text,
                profile,
              )
          : undefined
      }
      onSaved={next}
    />
  );
  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-600 dark:text-stone-400">
        Check every section and fix anything that is wrong. Nothing is used until you confirm.
      </p>
      {current.sideBySide && text ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section aria-label="Resume text" className="lg:sticky lg:top-4 lg:self-start">
            <h2 className="mb-2 text-sm font-medium">Text from your resume</h2>
            <pre className="max-h-[80vh] overflow-auto rounded-md border border-stone-200 bg-white p-3 text-xs whitespace-pre-wrap dark:border-stone-800 dark:bg-stone-900">
              {text}
            </pre>
          </section>
          {editor}
        </div>
      ) : (
        editor
      )}
      <StepFooter back={back}>
        <Button
          variant="ghost"
          onClick={() => {
            setPhase({ kind: "upload" });
          }}
        >
          Upload a different resume
        </Button>
      </StepFooter>
    </div>
  );
}
