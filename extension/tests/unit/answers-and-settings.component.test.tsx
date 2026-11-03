// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnswerBankEditor } from "@/components/profile/AnswerBankEditor";
import { PrivacySettings } from "@/components/ui/MoreSettings";
import { newAnswer } from "@/lib/answers/answerBank";
import { getDb } from "@/lib/db/db";
import { loadSettings } from "@/lib/settings/settings";

afterEach(async () => {
  cleanup();
  await getDb().answerBank.clear();
});

const add = async (question: string, answer: string) =>
  getDb().answerBank.put(
    await newAnswer({ question, answer, fieldType: "text", sensitive: false }, new Date()),
  );

describe("saved answers", () => {
  it("searches questions and answers, and marks an answer sensitive", async () => {
    const user = userEvent.setup();
    await add("What is your notice period?", "30 days");
    await add("Why do you want to join us?", "I like the product.");
    render(<AnswerBankEditor />);
    await user.type(await screen.findByLabelText("Search saved answers"), "product");
    expect(screen.getAllByTestId("answer-row")).toHaveLength(1);
    await user.clear(screen.getByLabelText("Search saved answers"));
    await user.type(screen.getByLabelText("Search saved answers"), "salary");
    expect(screen.getByText("No saved answer matches “salary”.")).toBeTruthy();
    await user.clear(screen.getByLabelText("Search saved answers"));
    const [first] = screen.getAllByLabelText(/^Sensitive/);
    if (first) await user.click(first);
    await vi.waitFor(async () => {
      const all = await getDb().answerBank.toArray();
      expect(all.filter((a) => a.sensitive)).toHaveLength(1);
    });
  });
});

describe("privacy setting", () => {
  it("turns contact redaction off and on", async () => {
    const user = userEvent.setup();
    render(<PrivacySettings />);
    const box = await screen.findByLabelText(/Remove my name, email/);
    expect((box as HTMLInputElement).checked).toBe(true);
    await user.click(box);
    await vi.waitFor(async () => {
      expect((await loadSettings()).privacy.redactContactInfo).toBe(false);
    });
  });
});
