// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InterviewPrepPanel } from "@/components/tracker/InterviewPrepPanel";
import { checkInterviewPrep, interviewPrepTask } from "@/lib/ai/tasks/interviewPrep";

const sendMessage = vi.hoisted(() => vi.fn());
vi.mock("@/lib/messaging/client", () => ({ sendMessage }));

afterEach(() => {
  cleanup();
  sendMessage.mockReset();
});

const now = new Date("2026-11-03T12:00:00Z");

const output = {
  technical: ["How would you design a rate limiter in Go?"],
  behavioral: ["Tell me about a production incident you handled."],
  talkingPoints: [
    { project: "payments-api", points: ["Built the retry queue."] },
    { project: "Invented Project", points: ["Did amazing things."] },
  ],
  brushUp: ["Kafka"],
  askThem: ["How is on-call shared?"],
};

describe("interviewPrep task", () => {
  it("keeps talking points only for the candidate's own projects", () => {
    const prep = checkInterviewPrep(output, [{ name: "Payments-API" }], now);
    expect(prep.talkingPoints).toEqual([
      { project: "Payments-API", points: ["Built the retry queue."] },
    ]);
    expect(prep.generatedAt).toBe("2026-11-03T12:00:00Z");
  });

  it("forbids invention and treats the job text as data", () => {
    const [system] = interviewPrepTask.buildMessages({
      job: {
        title: "Go Developer",
        company: "Acme",
        mustHave: ["Go"],
        niceToHave: [],
        responsibilities: "",
        seniority: "mid",
      },
      candidate: { headline: "", totalYears: 4, skills: ["Go"], recentRoles: [], projects: [] },
    });
    expect(system?.content).toContain("Never invent");
    expect(system?.content).toContain("untrusted data");
  });
});

describe("InterviewPrepPanel", () => {
  it("prepares on request and shows every part", async () => {
    const user = userEvent.setup();
    sendMessage.mockResolvedValue({
      prep: checkInterviewPrep(output, [{ name: "payments-api" }], now),
    });
    render(<InterviewPrepPanel jobId="j1" />);
    await user.click(screen.getByRole("button", { name: "Prepare for interview" }));
    expect(sendMessage).toHaveBeenCalledWith("ai/interviewPrep", { jobId: "j1" });
    expect(await screen.findByText("How would you design a rate limiter in Go?")).toBeTruthy();
    expect(screen.getByText("Talking points: payments-api")).toBeTruthy();
    expect(screen.getByText("Kafka")).toBeTruthy();
    expect(screen.getByText("How is on-call shared?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Prepare again" })).toBeTruthy();
  });

  it("shows a saved prep without asking the AI", () => {
    render(<InterviewPrepPanel jobId="j1" saved={checkInterviewPrep(output, [], now)} />);
    expect(screen.getByText("Tell me about a production incident you handled.")).toBeTruthy();
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
