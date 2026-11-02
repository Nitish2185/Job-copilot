/**
 * Apply-engine messages handled in the background (spec 16): AI answers for
 * non-sensitive questions. The background classifies the question again, so a
 * content script can never get the AI to answer a sensitive question.
 */
import { normalizeQuestion, newAnswer } from "../answers/answerBank";
import type { FieldKind } from "../apply/fields/discover";
import { EEO_KEYS, classifyField, isSensitiveKey } from "../apply/fields/rules";
import { isAiConfigured } from "../ai/configured";
import { runTask } from "../ai/runner";
import { buildRuntime } from "../ai/runtime";
import {
  acceptAnswer,
  answerQuestionTask,
  candidateForAnswers,
  jobForAnswers,
} from "../ai/tasks/answerQuestion";
import { getDb } from "../db/db";
import type { Handlers } from "../messaging/server";
import { loadProfile } from "../profile/store";

const NEVER_AI = new Set([
  ...EEO_KEYS,
  "privacy_acknowledgement",
  "resume_file",
  "cover_letter_file",
]);

export class SensitiveQuestionError extends Error {
  override name = "SensitiveQuestionError";
  constructor() {
    super("Only you answer this kind of question.");
  }
}

export async function answerWithAi(input: {
  question: string;
  kind: FieldKind;
  options: string[];
  maxLength?: number;
  jobId?: string;
}): Promise<{ answer?: string; confidence?: number; note?: string }> {
  const key = classifyField({ question: normalizeQuestion(input.question), kind: input.kind });
  if (isSensitiveKey(key) || NEVER_AI.has(key)) throw new SensitiveQuestionError();
  if (!(await isAiConfigured())) return { note: "Add an AI key to enable this" };

  const db = getDb();
  const [profile, analysis] = await Promise.all([
    loadProfile(db),
    input.jobId ? db.jdAnalyses.get(input.jobId) : Promise.resolve(undefined),
  ]);
  const result = await runTask(await buildRuntime(), answerQuestionTask, {
    question: input.question,
    fieldType: input.kind,
    options: input.options,
    ...(input.maxLength !== undefined && { maxLength: input.maxLength }),
    candidate: candidateForAnswers(profile),
    job: jobForAnswers(analysis),
  });
  const answer = acceptAnswer(result.value, input.options, input.maxLength);
  if (answer === undefined) {
    return {
      confidence: result.value.confidence,
      note: "The AI was not sure enough; please answer.",
    };
  }
  // New AI answers wait in the answer bank until the user approves them.
  const fieldType =
    input.options.length > 0
      ? input.kind === "radio"
        ? "radio"
        : "select"
      : input.kind === "textarea"
        ? "textarea"
        : "text";
  await db.answerBank.put(
    await newAnswer(
      {
        question: input.question,
        answer,
        fieldType,
        sensitive: false,
        source: "ai_approved",
        status: "pending_approval",
        ...(input.options.length > 0 && { options: input.options }),
      },
      new Date(),
    ),
  );
  return { answer, confidence: result.value.confidence };
}

export const applyHandlers: Handlers = {
  "ai/answerQuestion": (input) => answerWithAi(input),
};
