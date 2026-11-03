import type { AnswerBankEntry } from "@job-copilot/shared";
import { useLiveQuery } from "dexie-react-hooks";
import { Trash2 } from "lucide-react";
import { useState, type SyntheticEvent } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Section, inputClass } from "@/components/ui/Field";
import { EmptyState, ErrorMessage, Loading } from "@/components/ui/States";
import { answerToText, newAnswer, textToAnswer } from "@/lib/answers/answerBank";
import { getDb } from "@/lib/db/db";

function AnswerRow({ entry }: { entry: AnswerBankEntry }) {
  const [text, setText] = useState(answerToText(entry.answer));
  const [error, setError] = useState<string>();
  const changed = text !== answerToText(entry.answer);
  const id = `answer-${entry.id}`;

  const save = async () => {
    const answer = textToAnswer(text, entry.answer);
    if (answer === null) {
      setError(typeof entry.answer === "boolean" ? "Write Yes or No." : "Write an answer.");
      return;
    }
    setError(undefined);
    await getDb().answerBank.update(entry.id, { answer, status: "active" });
  };

  return (
    <li className="space-y-1 py-3" data-testid="answer-row">
      <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
        <span>{entry.question}</span>
        {entry.status === "pending_approval" && (
          <Badge tone="amber">Waiting for your approval</Badge>
        )}
        {entry.sensitive && <Badge tone="blue">Sensitive</Badge>}
        {entry.scope !== "global" && <Badge>{entry.scope.slice("company:".length)} only</Badge>}
      </div>
      <div className="flex items-end gap-2">
        <Field id={id} label="Answer" className="flex-1">
          <input
            id={id}
            className={inputClass}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
            }}
          />
        </Field>
        {(changed || entry.status === "pending_approval") && (
          <Button variant="primary" onClick={() => void save()}>
            {changed ? "Save" : "Approve"}
          </Button>
        )}
        <Button
          aria-label={`Delete the answer to: ${entry.question}`}
          onClick={() => void getDb().answerBank.delete(entry.id)}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500">
        <span>
          {entry.source === "ai_approved" ? "Suggested by AI" : "Your answer"} · used{" "}
          {String(entry.timesUsed)} time{entry.timesUsed === 1 ? "" : "s"}
        </span>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={entry.sensitive}
            onChange={(e) =>
              void getDb().answerBank.update(entry.id, { sensitive: e.target.checked })
            }
          />
          Sensitive (never synced; AI never answers it)
        </label>
      </div>
    </li>
  );
}

/** Saved answers to application questions (answer bank basics, spec 6 and 16.3). */
export function AnswerBankEditor() {
  const entries = useLiveQuery(() => getDb().answerBank.toArray(), []);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sensitive, setSensitive] = useState(false);
  const [search, setSearch] = useState("");

  const add = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (question.trim() === "" || answer.trim() === "") return;
    await getDb().answerBank.put(
      await newAnswer(
        { question, answer: answer.trim(), fieldType: "text", sensitive },
        new Date(),
      ),
    );
    setQuestion("");
    setAnswer("");
    setSensitive(false);
  };

  if (!entries) return <Loading />;
  const sorted = [...entries].sort(
    (a, b) =>
      Number(b.status === "pending_approval") - Number(a.status === "pending_approval") ||
      a.question.localeCompare(b.question),
  );
  const needle = search.trim().toLowerCase();
  const shown = needle
    ? sorted.filter(
        (e) =>
          e.question.toLowerCase().includes(needle) ||
          answerToText(e.answer).toLowerCase().includes(needle),
      )
    : sorted;
  return (
    <div className="space-y-4">
      <Section
        title="Saved answers"
        description="Answers to application questions, reused when the same question comes up again. AI suggestions are used only after you approve them."
      >
        {sorted.length > 0 && (
          <Field id="answer-search" label="Search saved answers">
            <input
              id="answer-search"
              type="search"
              className={inputClass}
              value={search}
              placeholder="Notice period, relocate, why this company..."
              onChange={(e) => {
                setSearch(e.target.value);
              }}
            />
          </Field>
        )}
        {sorted.length === 0 ? (
          <EmptyState title="No saved answers yet">
            Answers you give while applying are saved here.
          </EmptyState>
        ) : shown.length === 0 ? (
          <p className="text-sm text-stone-500">No saved answer matches “{search}”.</p>
        ) : (
          <ul className="divide-y divide-stone-200 dark:divide-stone-800">
            {shown.map((entry) => (
              <AnswerRow key={`${entry.id}:${answerToText(entry.answer)}`} entry={entry} />
            ))}
          </ul>
        )}
      </Section>
      <Section title="Add an answer">
        <form onSubmit={(e) => void add(e)} className="space-y-3">
          <Field id="new-question" label="Question">
            <input
              id="new-question"
              className={inputClass}
              value={question}
              placeholder="Why do you want to work here?"
              onChange={(e) => {
                setQuestion(e.target.value);
              }}
            />
          </Field>
          <Field id="new-answer" label="Your answer">
            <textarea
              id="new-answer"
              rows={3}
              className={inputClass}
              value={answer}
              onChange={(e) => {
                setAnswer(e.target.value);
              }}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={sensitive}
              onChange={(e) => {
                setSensitive(e.target.checked);
              }}
            />
            Sensitive (always ask before using it on a new site)
          </label>
          <Button
            type="submit"
            variant="primary"
            disabled={question.trim() === "" || answer.trim() === ""}
          >
            Add answer
          </Button>
        </form>
      </Section>
    </div>
  );
}
