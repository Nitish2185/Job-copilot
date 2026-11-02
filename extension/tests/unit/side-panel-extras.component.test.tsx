// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AutoViaPlatform,
  SavedAnswers,
  SubmittedPrompt,
  autoPlatformFor,
} from "@/entrypoints/sidepanel/PagePanels";
import { newAnswer } from "@/lib/answers/answerBank";
import { getDb } from "@/lib/db/db";
import { sampleJob } from "./helpers";

const sendMessage = vi.hoisted(() => vi.fn());
vi.mock("@/lib/messaging/client", () => ({ sendMessage }));

afterEach(async () => {
  cleanup();
  sendMessage.mockReset();
  await getDb().answerBank.clear();
});

const naukriJob = sampleJob({
  id: "manual:1",
  platform: "naukri",
  url: "https://www.naukri.com/job-listings-1",
  applyUrl: "https://jobs.lever.co/acme/1",
  externalApplyUrl: "https://jobs.lever.co/acme/1",
  mode: "auto",
});

describe("Apply automatically via <platform>", () => {
  it("names the Auto platform behind a company-site link", () => {
    expect(autoPlatformFor(naukriJob)).toBe("Lever");
    expect(
      autoPlatformFor({ ...naukriJob, externalApplyUrl: "https://careers.acme.com/1" }),
    ).toBeUndefined();
    expect(autoPlatformFor(sampleJob())).toBeUndefined();
  });

  it("queues only after the user confirms", async () => {
    const user = userEvent.setup();
    sendMessage.mockResolvedValue({ queued: 1, skipped: [] });
    render(<AutoViaPlatform job={naukriJob} />);
    await user.click(screen.getByRole("button", { name: "Apply automatically via Lever" }));
    expect(screen.getByText(/Nothing is clicked or sent on this site/)).toBeTruthy();
    expect(sendMessage).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Queue it" }));
    expect(sendMessage).toHaveBeenCalledWith("queue/add", { jobIds: ["manual:1"] });
    expect(await screen.findByText(/Queued/)).toBeTruthy();
  });

  it("shows why the queue refused", async () => {
    const user = userEvent.setup();
    sendMessage.mockResolvedValue({
      queued: 0,
      skipped: [{ jobId: "manual:1", reason: "Turn on auto-apply in Settings first." }],
    });
    render(<AutoViaPlatform job={naukriJob} />);
    await user.click(screen.getByRole("button", { name: "Apply automatically via Lever" }));
    await user.click(screen.getByRole("button", { name: "Queue it" }));
    expect(await screen.findByText("Turn on auto-apply in Settings first.")).toBeTruthy();
  });
});

describe("Did you submit?", () => {
  it("records the application on Yes", async () => {
    const user = userEvent.setup();
    sendMessage.mockResolvedValue({ created: true });
    render(<SubmittedPrompt tabId={7} resumeChoice="current" />);
    await user.click(screen.getByRole("button", { name: "Yes, I submitted it" }));
    expect(sendMessage).toHaveBeenCalledWith("apply/markApplied", {
      tabId: 7,
      resumeChoice: "current",
    });
    expect(await screen.findByText("Saved to your applications.")).toBeTruthy();
  });

  it("goes away on Not yet", async () => {
    const user = userEvent.setup();
    render(<SubmittedPrompt tabId={7} resumeChoice="current" />);
    await user.click(screen.getByRole("button", { name: "Not yet" }));
    expect(screen.queryByText(/Did you submit/)).toBeNull();
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe("Saved answers", () => {
  it("lists active, non-sensitive answers with copy buttons and a filter", async () => {
    const user = userEvent.setup();
    const now = new Date();
    const entries = await Promise.all([
      newAnswer(
        {
          question: "Why do you want to join us?",
          answer: "I like the product.",
          fieldType: "textarea",
          sensitive: false,
          source: "user",
          status: "active",
        },
        now,
      ),
      newAnswer(
        {
          question: "Expected CTC",
          answer: "18 LPA",
          fieldType: "text",
          sensitive: true,
          source: "user",
          status: "active",
        },
        now,
      ),
      newAnswer(
        {
          question: "Years of Kafka",
          answer: 3,
          fieldType: "number",
          sensitive: false,
          source: "ai_approved",
          status: "pending_approval",
        },
        now,
      ),
    ]);
    await getDb().answerBank.bulkPut(entries);
    render(<SavedAnswers />);
    await user.click(await screen.findByText("Saved answers"));
    expect(screen.getByText("I like the product.")).toBeTruthy();
    expect(screen.queryByText("18 LPA")).toBeNull();
    expect(screen.queryByText("Years of Kafka")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Copy answer to Why do you want to join us?" }),
    ).toBeTruthy();
    await user.type(screen.getByLabelText("Find a saved answer"), "salary");
    expect(screen.queryByText("I like the product.")).toBeNull();
  });
});
