// @vitest-environment jsdom
import type { Application } from "@job-copilot/shared";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrackerPage } from "@/entrypoints/dashboard/pages/TrackerPage";
import { getDb } from "@/lib/db/db";
import { sampleJob } from "./helpers";

const download = vi.hoisted(() => vi.fn());
vi.mock("@/lib/files/open", () => ({ downloadBlob: download, openStoredFile: vi.fn() }));

const longAgo = new Date(Date.now() - 40 * 86_400_000).toISOString().replace(/\.\d{3}Z$/, "Z");

function app(overrides: Partial<Application> = {}): Application {
  return {
    id: "a1",
    jobId: "lever:acme:1",
    mode: "assist",
    status: "submitted",
    stage: "applied",
    resumeChoice: "current",
    answersSent: [{ question: "Notice period", answer: "30 days", source: "profile" }],
    submittedAt: longAgo,
    notes: "",
    events: [{ at: longAgo, type: "submitted" }],
    ...overrides,
  };
}

beforeEach(async () => {
  const db = getDb();
  await db.jobs.put(sampleJob());
  await db.jobs.put(sampleJob({ id: "lever:globex:2", company: { name: "Globex" } }));
  await db.applications.bulkPut([
    app(),
    app({ id: "a2", jobId: "lever:globex:2", stage: "interview" }),
    app({ id: "a3", status: "needs_you" }),
  ]);
  try {
    localStorage.clear();
  } catch {
    // jsdom always has localStorage
  }
});

afterEach(async () => {
  cleanup();
  download.mockClear();
  await getDb().applications.clear();
  await getDb().jobs.clear();
});

describe("TrackerPage", () => {
  it("shows sent applications in their columns with follow-up flags", async () => {
    render(<TrackerPage />);
    const applied = await screen.findByRole("region", { name: "Applied" });
    expect(within(applied).getByText("Backend Engineer")).toBeTruthy();
    expect(within(applied).getByText("Follow up")).toBeTruthy();
    expect(within(applied).getByText("No reply")).toBeTruthy();
    const interview = screen.getByRole("region", { name: "Interview" });
    expect(within(interview).getByText("Globex")).toBeTruthy();
    // The stopped (needs-you) application is not on the tracker.
    expect(screen.getAllByTestId("tracker-card")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /Move Backend Engineer at Acme/ })).toBeTruthy();
  });

  it("changes the stage in the drawer and records it on the timeline", async () => {
    const user = userEvent.setup();
    render(<TrackerPage />);
    const applied = await screen.findByRole("region", { name: "Applied" });
    await user.click(within(applied).getByText("Backend Engineer"));
    const drawer = await screen.findByRole("dialog");
    expect(within(drawer).getByText("30 days")).toBeTruthy();
    await user.selectOptions(within(drawer).getByLabelText("Stage"), "screening");
    await vi.waitFor(async () => {
      const saved = await getDb().applications.get("a1");
      expect(saved?.stage).toBe("screening");
      expect(saved?.events.at(-1)).toMatchObject({ type: "stage", detail: "applied -> screening" });
    });
    expect(await within(drawer).findByText(/Applied → Screening/)).toBeTruthy();
  });

  it("marks a silent application as ghosted from the suggestion", async () => {
    const user = userEvent.setup();
    render(<TrackerPage />);
    const applied = await screen.findByRole("region", { name: "Applied" });
    await user.click(within(applied).getByText("Backend Engineer"));
    await user.click(await screen.findByRole("button", { name: "Mark as ghosted" }));
    await vi.waitFor(async () => {
      expect((await getDb().applications.get("a1"))?.stage).toBe("ghosted");
    });
  });

  it("saves notes, contacts and interview dates", async () => {
    const user = userEvent.setup();
    render(<TrackerPage />);
    const applied = await screen.findByRole("region", { name: "Applied" });
    await user.click(within(applied).getByText("Backend Engineer"));
    const drawer = await screen.findByRole("dialog");
    await user.type(within(drawer).getByLabelText("Notes"), "Recruiter said two weeks");
    await user.type(within(drawer).getByLabelText("Contact name"), "Priya Rao");
    await user.type(within(drawer).getByLabelText("Contact role"), "Recruiter");
    await user.click(within(drawer).getByRole("button", { name: "Add contact" }));
    await vi.waitFor(async () => {
      const saved = await getDb().applications.get("a1");
      expect(saved?.notes).toBe("Recruiter said two weeks");
      expect(saved?.contacts).toEqual([{ name: "Priya Rao", role: "Recruiter" }]);
    });
  });

  it("has a list view with a stage menu, and exports CSV", async () => {
    const user = userEvent.setup();
    render(<TrackerPage />);
    await user.click(await screen.findByRole("button", { name: "List" }));
    const select = screen.getByLabelText("Stage of Backend Engineer at Globex");
    await user.selectOptions(select, "offer");
    await vi.waitFor(async () => {
      expect((await getDb().applications.get("a2"))?.stage).toBe("offer");
    });
    await user.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(download).toHaveBeenCalledOnce();
    const [blob, name] = download.mock.calls[0] as [Blob, string];
    expect(name).toMatch(/^jobcopilot-applications-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(await blob.text()).toContain("Globex,Backend Engineer,Offer");
  });

  it("explains the empty tracker", async () => {
    await getDb().applications.clear();
    render(<TrackerPage />);
    expect(await screen.findByText("No applications yet")).toBeTruthy();
  });
});
