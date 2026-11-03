import { AnswerBankEditor } from "@/components/profile/AnswerBankEditor";

/** Saved answers (spec 18.1 `#/answers`): search, edit, delete, mark sensitive, approve AI ones. */
export function AnswersPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Saved answers</h1>
      <AnswerBankEditor />
    </div>
  );
}
