// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnswerBankEditor } from "@/components/profile/AnswerBankEditor";
import { newAnswer } from "@/lib/answers/answerBank";
import { getDb } from "@/lib/db/db";

afterEach(async () => {
  cleanup();
  await getDb().answerBank.clear();
});

describe("AnswerBankEditor", () => {
  it("adds an answer the user types", async () => {
    const user = userEvent.setup();
    render(<AnswerBankEditor />);
    await user.type(await screen.findByLabelText("Question"), "Why this company?");
    await user.type(screen.getByLabelText("Your answer"), "I use its product every day.");
    await user.click(screen.getByRole("button", { name: "Add answer" }));

    await vi.waitFor(async () => {
      expect(await getDb().answerBank.count()).toBe(1);
    });
    const [entry] = await getDb().answerBank.toArray();
    expect(entry).toMatchObject({
      question: "Why this company?",
      normalized: "why this company",
      answer: "I use its product every day.",
      source: "user",
      status: "active",
      sensitive: false,
    });
    expect(await screen.findByText("Why this company?")).toBeTruthy();
  });

  it("uses an AI suggestion only after the user approves it", async () => {
    const user = userEvent.setup();
    const entry = await newAnswer(
      {
        question: "Describe a project you are proud of",
        answer: "A payments dashboard in React.",
        fieldType: "textarea",
        sensitive: false,
        source: "ai_approved",
        status: "pending_approval",
      },
      new Date(),
    );
    await getDb().answerBank.put(entry);
    render(<AnswerBankEditor />);

    expect(await screen.findByText("Waiting for your approval")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Approve" }));
    await vi.waitFor(async () => {
      expect((await getDb().answerBank.get(entry.id))?.status).toBe("active");
    });
  });
});
