import { afterEach, describe, expect, it, vi } from "vitest";
import type * as Runner from "@/lib/ai/runner";
import { acceptAnswer, type AnswerOutput } from "@/lib/ai/tasks/answerQuestion";
import { SensitiveQuestionError, answerWithAi } from "@/lib/background/applyHandlers";
import { getDb } from "@/lib/db/db";
import { senderAllowed } from "@/lib/messaging/server";
import { updateSecrets } from "@/lib/settings/settings";

const reply = vi.hoisted(() => ({
  value: {
    answer: "Go and Kubernetes",
    confidence: 0.9,
    basis: "profile",
    needsUser: false,
  },
}));
const runTask = vi.hoisted(() =>
  vi.fn((_rt: Runner.AiRuntime, _task: unknown, _input: unknown) =>
    Promise.resolve({ value: reply.value, model: "mock", cached: false }),
  ),
);
vi.mock("@/lib/ai/runner", async (importOriginal) => ({
  ...(await importOriginal<typeof Runner>()),
  runTask,
}));

afterEach(async () => {
  runTask.mockClear();
  await getDb().answerBank.clear();
});

describe("acceptAnswer (code decides)", () => {
  const out = (o: Partial<AnswerOutput>): AnswerOutput => ({
    answer: "Yes",
    confidence: 0.9,
    basis: "profile",
    needsUser: false,
    ...o,
  });
  it("needs confidence of at least 0.75, an exact option and the length limit", () => {
    expect(acceptAnswer(out({}), ["Yes", "No"])).toBe("Yes");
    expect(acceptAnswer(out({ confidence: 0.7 }), ["Yes", "No"])).toBeUndefined();
    expect(acceptAnswer(out({ answer: "yes" }), ["Yes", "No"])).toBeUndefined();
    expect(acceptAnswer(out({ needsUser: true }), [])).toBeUndefined();
    expect(acceptAnswer(out({ answer: "x".repeat(20) }), [], 10)).toBeUndefined();
    expect(acceptAnswer(out({ answer: "Short" }), [], 10)).toBe("Short");
  });
});

describe("answerWithAi (background)", () => {
  it("refuses sensitive questions before any AI call", async () => {
    await updateSecrets({ aiKeys: { gemini: "k" } });
    for (const question of [
      "Will you require visa sponsorship?",
      "What is your expected CTC?",
      "What is your notice period?",
      "Are you authorized to work in the US?",
      "Have you ever been convicted of a crime?",
      "Date of birth",
      "Gender",
    ]) {
      await expect(answerWithAi({ question, kind: "text", options: [] })).rejects.toThrow(
        SensitiveQuestionError,
      );
    }
    expect(runTask).not.toHaveBeenCalled();
  });

  it("says AI is off without a key", async () => {
    expect(
      await answerWithAi({ question: "Which tools do you know?", kind: "text", options: [] }),
    ).toEqual({
      note: "Add an AI key to enable this",
    });
  });

  it("returns an accepted answer and saves it for approval", async () => {
    await updateSecrets({ aiKeys: { gemini: "k" } });
    const result = await answerWithAi({
      question: "Which tools do you know best?",
      kind: "textarea",
      options: [],
    });
    expect(result.answer).toBe("Go and Kubernetes");
    const [entry] = await getDb().answerBank.toArray();
    expect(entry).toMatchObject({
      status: "pending_approval",
      source: "ai_approved",
      answer: "Go and Kubernetes",
    });
  });
});

describe("any_page sender rule", () => {
  const ctx = { extensionId: "ext", extensionOrigin: "chrome-extension://ext/" };
  it("accepts our content script on web pages and our extension pages, nothing else", () => {
    const rule = { kind: "any_page" } as const;
    expect(
      senderAllowed(
        rule,
        { id: "ext", tab: { url: "https://careers.example.com/apply" } as never },
        ctx,
      ),
    ).toBe(true);
    expect(
      senderAllowed(rule, { id: "ext", url: "chrome-extension://ext/sidepanel.html" }, ctx),
    ).toBe(true);
    expect(senderAllowed(rule, { id: "other", tab: { url: "https://x.com" } as never }, ctx)).toBe(
      false,
    );
    expect(
      senderAllowed(rule, { id: "ext", tab: { url: "file:///etc/passwd" } as never }, ctx),
    ).toBe(false);
  });
});
