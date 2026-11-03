/**
 * Phase 10: moving an application on the tracker board by dragging it (mouse)
 * records the stage change; the drawer shows it on the timeline.
 */
import { expect, test } from "./fixtures";
import { putRecords, readAll, waitFor } from "./helpers";

const job = {
  id: "lever:fixture:1",
  platform: "lever",
  source: "feed",
  company: { name: "Fixture Corp", token: "fixture" },
  title: "Backend Engineer",
  locations: [],
  remote: "remote",
  countryCodes: [],
  url: "https://jobs.lever.co/fixture/1",
  applyUrl: "https://jobs.lever.co/fixture/1",
  firstSeenAt: "2026-10-01T00:00:00Z",
  skills: [],
  snippet: "",
  mode: "auto",
  dedupeKey: "fixture corp|backend engineer|",
  status: "applied",
};

const application = {
  id: "app-1",
  jobId: job.id,
  mode: "auto",
  status: "submitted",
  stage: "applied",
  resumeChoice: "current",
  answersSent: [],
  submittedAt: "2026-10-28T10:00:00Z",
  notes: "",
  events: [{ at: "2026-10-28T10:00:00Z", type: "submitted" }],
};

test("drags an application to Interview and records it", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/dashboard.html#/tracker`);
  await putRecords(page, { jobs: [job], applications: [application] });
  await page.reload();

  const handle = page.getByRole("button", { name: "Move Backend Engineer at Fixture Corp" });
  const target = page.getByRole("region", { name: "Interview" });
  const from = await handle.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("board not laid out");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + 60, { steps: 12 });
  await page.mouse.up();

  await expect(target.getByText("Backend Engineer")).toBeVisible();
  const saved = await waitFor(async () => {
    const [app] = await readAll<{ stage: string; events: { type: string; detail?: string }[] }>(
      page,
      "applications",
    );
    return app?.stage === "interview" ? app : undefined;
  }, 10_000);
  expect(saved.events.at(-1)).toMatchObject({ type: "stage", detail: "applied -> interview" });

  await target.getByText("Backend Engineer").click();
  await expect(page.getByRole("dialog")).toContainText("Applied → Interview");
});
