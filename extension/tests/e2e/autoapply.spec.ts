/// <reference types="node" />
/**
 * Phase 8 acceptance: a dry run on a local fixture form stops before submitting
 * and shows what would be sent; with dry run off, a test-only full submit on the
 * local fixture is confirmed and recorded. E2E builds treat 127.0.0.1/greenhouse/
 * as a Greenhouse form; release builds never include that host.
 */
import { readFileSync } from "node:fs";
import { expect, test } from "./fixtures";
import { TEST_PROFILE, TEST_RESUME_FILE, putRecords, readAll, waitFor } from "./helpers";

const FORM = readFileSync(new URL("./forms/greenhouse-apply.html", import.meta.url), "utf8");
const DONE = readFileSync(new URL("./forms/greenhouse-confirmation.html", import.meta.url), "utf8");

interface App {
  id: string;
  jobId: string;
  status: string;
  dryRun?: boolean;
  confirmationText?: string;
  answersSent: { question: string; answer: string }[];
}

function job(id: string, applyUrl: string) {
  return {
    id,
    platform: "greenhouse",
    source: "feed",
    company: { name: `Fixture Corp ${id}`, token: "fixture" },
    title: `Backend Engineer ${id}`,
    locations: [],
    remote: "remote",
    countryCodes: [],
    url: applyUrl,
    applyUrl,
    firstSeenAt: "2026-11-01T00:00:00Z",
    skills: ["react"],
    snippet: "Build things.",
    mode: "auto",
    dedupeKey: `fixture corp ${id}|backend engineer|`,
    status: "new",
  };
}

const score = (jobId: string) => ({
  jobId,
  profileVersion: 1,
  prefilter: { score: 90, matchedSkills: ["react"], missingSkills: [], passed: true, reasons: [] },
  final: 90,
  isEstimate: true,
  scoredAt: "2026-11-02T00:00:00Z",
});

test("auto-apply: dry run stops before submitting, then a full submit is confirmed", async ({
  context,
  extensionId,
  server,
}) => {
  server.files.set("/greenhouse/acme/jobs/1.html", FORM);
  server.files.set("/greenhouse/acme/jobs/2.html", FORM);
  server.files.set("/greenhouse/confirmation.html", DONE);
  const dashboard = await context.newPage();
  await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html#/settings`);
  const one = job("greenhouse:fixture:1", `${server.url}/greenhouse/acme/jobs/1.html`);
  const two = job("greenhouse:fixture:2", `${server.url}/greenhouse/acme/jobs/2.html`);
  await putRecords(dashboard, {
    profile: [TEST_PROFILE],
    files: [{ ...TEST_RESUME_FILE, blobText: "%PDF-1.4 fixture" }],
    jobs: [one, two],
    scores: [score(one.id), score(two.id)],
  });

  // Turn on auto-apply through the explanation dialog, then switch on dry run.
  await dashboard.reload();
  await dashboard.getByRole("button", { name: "Turn on auto-apply" }).click();
  const dialog = dashboard.getByRole("dialog");
  await expect(dialog).toContainText("Before you turn on auto-apply");
  await expect(dialog.getByRole("button", { name: "Turn on" })).toBeDisabled();
  await dialog.getByLabel("Apply automatically from score").fill("80");
  await dialog.getByLabel("Approval").selectOption("below_threshold");
  await dialog.getByLabel("I understand what auto-apply does").check();
  await dialog.getByRole("button", { name: "Turn on" }).click();
  await expect(dashboard.getByTestId("auto-apply-status")).toContainText("Auto-apply is on.");
  await dashboard.getByLabel("Dry run: fill and check, but never submit").check();
  await dashboard.getByLabel("Pause between applications (s)").fill("30");
  await dashboard.getByRole("button", { name: "Save auto-apply settings" }).click();
  await expect(dashboard.getByText("Saved.", { exact: true })).toBeVisible();

  // Dry run: queue from the job page; it fills in a background tab and stops.
  await dashboard.goto(
    `chrome-extension://${extensionId}/dashboard.html#/jobs/${encodeURIComponent(one.id)}`,
  );
  await dashboard.getByRole("button", { name: "Apply automatically" }).click();
  await expect(dashboard.getByRole("status")).toContainText("Queued");
  const dry = await waitFor(async () =>
    (await readAll<App>(dashboard, "applications")).find((a) => a.jobId === one.id && a.dryRun),
  );
  expect(dry.status).toBe("needs_you");
  expect(dry.answersSent).toContainEqual({
    question: "First Name *",
    answer: "Aarav",
    source: "profile",
  });
  expect(server.requests).not.toContain("/greenhouse/confirmation.html");
  await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html#/needs-you`);
  await expect(dashboard.getByTestId("needs-you-item")).toContainText(
    "This is what would have been submitted",
  );

  // Test-only full submit on the local fixture: dry run off, the next job is sent and confirmed.
  await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html#/settings`);
  await dashboard.getByLabel("Dry run: fill and check, but never submit").uncheck();
  await dashboard.getByRole("button", { name: "Save auto-apply settings" }).click();
  await expect(dashboard.getByText("Saved.", { exact: true })).toBeVisible();
  await dashboard.evaluate(async (jobId) => {
    const { chrome } = globalThis as unknown as {
      chrome: { runtime: { sendMessage: (m: unknown) => Promise<unknown> } };
    };
    await chrome.runtime.sendMessage({ type: "queue/add", payload: { jobIds: [jobId] } });
  }, two.id);
  const sent = await waitFor(
    async () =>
      (await readAll<App>(dashboard, "applications")).find(
        (a) =>
          a.jobId === two.id &&
          (a.status === "submitted" || a.status === "needs_you" || a.status === "failed"),
      ),
    90_000,
  );
  expect(sent.status).toBe("submitted");
  expect(sent.confirmationText).toContain("Thank you for applying");
  expect(server.requests).toContain("/greenhouse/confirmation.html");

  // Never twice: queueing the same job again is refused.
  const again = await dashboard.evaluate(async (jobId) => {
    const { chrome } = globalThis as unknown as {
      chrome: { runtime: { sendMessage: (m: unknown) => Promise<unknown> } };
    };
    return chrome.runtime.sendMessage({ type: "queue/add", payload: { jobIds: [jobId] } });
  }, two.id);
  expect(JSON.stringify(again)).toContain("already applied");
});
