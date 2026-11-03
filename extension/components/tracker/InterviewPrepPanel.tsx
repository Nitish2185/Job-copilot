import type { InterviewPrep } from "@job-copilot/shared";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorMessage } from "@/components/ui/States";
import { sendMessage } from "@/lib/messaging/client";

function List({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{title}</h4>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function PrepView({ prep }: { prep: InterviewPrep }): ReactNode {
  return (
    <div className="space-y-3 text-sm" data-testid="interview-prep">
      <List title="Technical questions" items={prep.technical} />
      <List title="Behavioral questions" items={prep.behavioral} />
      {prep.talkingPoints.map((t) => (
        <List key={t.project} title={`Talking points: ${t.project}`} items={t.points} />
      ))}
      <List title="Brush up on" items={prep.brushUp} />
      <List title="Questions to ask them" items={prep.askThem} />
    </div>
  );
}

/**
 * "Prepare for interview" (spec 15.2): likely questions, talking points from the
 * user's own projects, skills to brush up on and questions to ask. Saved with
 * the application when there is one.
 */
export function InterviewPrepPanel({ jobId, saved }: { jobId: string; saved?: InterviewPrep }) {
  const [prep, setPrep] = useState<InterviewPrep | undefined>(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const shown = prep ?? saved;

  const run = async () => {
    setBusy(true);
    setError(undefined);
    try {
      setPrep((await sendMessage("ai/interviewPrep", { jobId })).prep);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not prepare.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">Interview prep</h3>
      {shown && <PrepView prep={shown} />}
      <Button onClick={() => void run()} disabled={busy}>
        {busy ? "Preparing..." : shown ? "Prepare again" : "Prepare for interview"}
      </Button>
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </section>
  );
}
