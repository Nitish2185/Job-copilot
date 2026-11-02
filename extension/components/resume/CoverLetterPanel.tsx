import type { CoverLetter, Job, Profile } from "@job-copilot/shared";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { ErrorMessage } from "@/components/ui/States";
import { getDb } from "@/lib/db/db";
import { sendMessage } from "@/lib/messaging/client";
import { COVER_LETTER_WORDS, coverLetterFileName, saveCoverLetter } from "@/lib/resume/coverLetter";
import { resumeFileName } from "@/lib/resume/document";
import { makeCoverLetterPdf } from "@/lib/resume/make";
import { wordCount } from "@/lib/resume/validate";

function Editor({ letter, job, profile }: { letter: CoverLetter; job: Job; profile: Profile }) {
  const [text, setText] = useState(letter.text);
  const [note, setNote] = useState<string>();
  const words = wordCount(text);
  const changed = text !== letter.text;

  const download = async () => {
    const bytes = await makeCoverLetterPdf(profile, text);
    const url = URL.createObjectURL(new Blob([bytes.slice()], { type: "application/pdf" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = coverLetterFileName(resumeFileName(profile.basics.fullName, job.company.name));
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 10_000);
  };

  return (
    <div className="space-y-2">
      {letter.validation.issues.length > 0 && (
        <ul
          className="list-disc space-y-1 pl-5 text-xs text-amber-800 dark:text-amber-300"
          data-testid="letter-issues"
        >
          {letter.validation.issues.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}
      <label htmlFor="cover-letter" className="sr-only">
        Cover letter
      </label>
      <textarea
        id="cover-letter"
        rows={14}
        className={inputClass}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setNote(undefined);
        }}
      />
      <p
        className={`text-xs ${words < COVER_LETTER_WORDS.min || words > COVER_LETTER_WORDS.max ? "text-amber-700" : "text-slate-500"}`}
      >
        {String(words)} words
      </p>
      <div className="flex flex-wrap gap-2">
        {changed && (
          <Button
            variant="primary"
            onClick={() =>
              void saveCoverLetter(getDb(), { jobId: job.id, text, issues: [] }).then(() => {
                setNote("Saved.");
              })
            }
          >
            Save changes
          </Button>
        )}
        <Button
          onClick={() =>
            void navigator.clipboard.writeText(text).then(() => {
              setNote("Copied.");
            })
          }
        >
          Copy
        </Button>
        <Button onClick={() => void download()}>Download PDF</Button>
      </div>
      {note && (
        <p role="status" className="text-xs text-green-700 dark:text-green-400">
          {note}
        </p>
      )}
    </div>
  );
}

/** Cover letter for one job: write with AI, check, edit, copy or download (spec 15.1). */
export function CoverLetterPanel({ job, profile }: { job: Job; profile: Profile }) {
  const letter = useLiveQuery(
    () => getDb().coverLetters.where("jobId").equals(job.id).first(),
    [job.id],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const write = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await sendMessage("ai/writeCoverLetter", { jobId: job.id });
      await saveCoverLetter(getDb(), { jobId: job.id, text: result.text, issues: result.issues });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not write the cover letter.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 text-sm">
      <Button onClick={() => void write()} disabled={busy}>
        {busy ? "Writing..." : letter ? "Write it again" : "Write a cover letter"}
      </Button>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {letter && <Editor key={letter.id} letter={letter} job={job} profile={profile} />}
    </div>
  );
}
