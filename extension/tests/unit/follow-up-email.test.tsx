// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FollowUpEmail } from "@/components/tracker/FollowUpEmail";
import { followUpEmailTask, followUpProblems } from "@/lib/ai/tasks/followUpEmail";

const sendMessage = vi.hoisted(() => vi.fn());
vi.mock("@/lib/messaging/client", () => ({ sendMessage }));

afterEach(() => {
  cleanup();
  sendMessage.mockReset();
});

describe("followUpEmail task", () => {
  it("asks for facts from the application only", () => {
    const [system, user] = followUpEmailTask.buildMessages({
      job: { title: "Backend Engineer", company: "Acme" },
      appliedOn: "2026-10-01",
      candidate: { name: "Aarav Mehta", headline: "Developer", skills: ["Go"] },
      contactName: "Priya",
    });
    expect(system?.content).toContain("Never invent");
    expect(system?.content).toContain("No placeholders");
    expect(user?.content).toContain('"contactName":"Priya"');
  });

  it("flags placeholders left in the draft", () => {
    expect(
      followUpProblems({ subject: "Following up", body: "Dear [Hiring Manager]," }),
    ).toHaveLength(1);
    expect(followUpProblems({ subject: "Following up", body: "Dear Priya," })).toEqual([]);
  });
});

describe("FollowUpEmail", () => {
  it("drafts an editable email and copies it", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    sendMessage.mockResolvedValue({
      subject: "Backend Engineer application",
      body: "Dear Priya,\nI applied on 1 October.\nAarav Mehta",
      issues: [],
    });
    render(<FollowUpEmail applicationId="a1" />);
    await user.click(screen.getByRole("button", { name: "Draft a follow-up email" }));
    expect(sendMessage).toHaveBeenCalledWith("ai/followUpEmail", { applicationId: "a1" });
    const subject = await screen.findByLabelText("Email subject");
    await user.clear(subject);
    await user.type(subject, "Following up");
    await user.click(screen.getByRole("button", { name: "Copy email" }));
    expect(writeText).toHaveBeenCalledWith(
      "Subject: Following up\n\nDear Priya,\nI applied on 1 October.\nAarav Mehta",
    );
  });

  it("shows why it could not write", async () => {
    const user = userEvent.setup();
    sendMessage.mockRejectedValue(new Error("Add an AI key to enable this"));
    render(<FollowUpEmail applicationId="a1" />);
    await user.click(screen.getByRole("button", { name: "Draft a follow-up email" }));
    expect(await screen.findByText("Add an AI key to enable this")).toBeTruthy();
  });
});
