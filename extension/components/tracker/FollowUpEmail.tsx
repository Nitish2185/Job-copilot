import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { ErrorMessage } from "@/components/ui/States";
import { sendMessage } from "@/lib/messaging/client";

/**
 * A follow-up email the AI drafts and the user edits, copies and sends from
 * their own mail (spec 19.2). Nothing is sent from Job Copilot.
 */
export function FollowUpEmail({ applicationId }: { applicationId: string }) {
  const [draft, setDraft] = useState<{ subject: string; body: string; issues: string[] }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);

  const write = async () => {
    setBusy(true);
    setError(undefined);
    setCopied(false);
    try {
      setDraft(await sendMessage("ai/followUpEmail", { applicationId }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not write the email.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">Follow-up email</h3>
      <Button onClick={() => void write()} disabled={busy}>
        {busy ? "Writing..." : draft ? "Write it again" : "Draft a follow-up email"}
      </Button>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {draft && (
        <div className="space-y-2">
          <input
            aria-label="Email subject"
            className={inputClass}
            value={draft.subject}
            onChange={(e) => {
              setDraft({ ...draft, subject: e.target.value });
            }}
          />
          <textarea
            aria-label="Email text"
            rows={8}
            className={inputClass}
            value={draft.body}
            onChange={(e) => {
              setDraft({ ...draft, body: e.target.value });
            }}
          />
          {draft.issues.map((issue) => (
            <p key={issue} className="text-xs text-amber-800 dark:text-amber-300">
              {issue}
            </p>
          ))}
          <div className="flex items-center gap-2">
            <Button
              onClick={() =>
                void navigator.clipboard
                  .writeText(`Subject: ${draft.subject}\n\n${draft.body}`)
                  .then(() => {
                    setCopied(true);
                  })
              }
            >
              {copied ? "Copied" : "Copy email"}
            </Button>
            <span className="text-xs text-slate-500">Send it from your own email.</span>
          </div>
        </div>
      )}
    </section>
  );
}
