/// <reference types="node" />
/**
 * Phase 3 acceptance: the dashboard shows thousands of jobs from a local fixture
 * feed, and adding a personal board works against fixture data.
 */
import { readFileSync } from "node:fs";
import { expect, publishFeed, test } from "./fixtures";

const LEVER_FIXTURE = readFileSync(
  new URL("../../../crawler/testdata/fixtures/lever_postings.json", import.meta.url),
  "utf8",
);

test("syncs a local fixture feed and lists thousands of jobs", async ({
  context,
  extensionId,
  server,
}) => {
  publishFeed(server, 3000);
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/dashboard.html#/settings`);

  await page.getByLabel(/Feed address/).fill(`${server.url}/feed/`);
  await page.getByRole("button", { name: "Save and sync" }).click();
  await expect(page.getByRole("status")).toHaveText(/3000 open jobs/, { timeout: 30_000 });
  expect(server.requests).toContain("/feed/snapshot.json");

  await page.getByRole("link", { name: "Jobs" }).click();
  await expect(page.getByTestId("job-count")).toHaveText("3,000 jobs");
  // Only a window of rows is rendered (virtualized list).
  const rendered = await page.getByTestId("job-row").count();
  expect(rendered).toBeGreaterThan(5);
  expect(rendered).toBeLessThan(100);

  await page.getByLabel("Search jobs").fill("Data Scientist");
  await expect(page.getByTestId("job-count")).toHaveText("600 jobs");

  // A second sync with an unchanged index downloads nothing else.
  server.requests.length = 0;
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.getByRole("button", { name: "Sync now" })).toBeEnabled();
  expect(server.requests).toEqual(["/feed/index.json"]);
});

test("adds a personal company board from a careers link", async ({ context, extensionId }) => {
  // The board API is answered from a saved fixture: no real job site is contacted.
  await context.route("https://api.lever.co/v0/postings/palantir?mode=json", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: LEVER_FIXTURE }),
  );
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/dashboard.html#/companies`);

  await page.getByLabel("Careers or job link").fill("https://jobs.lever.co/palantir");
  await page.getByRole("button", { name: "Add company" }).click();
  await expect(page.getByRole("status")).toHaveText("Added Palantir with 3 jobs.");
  await expect(page.getByTestId("company-row")).toHaveCount(1);

  await page.getByLabel("Careers or job link").fill("https://www.naukri.com/job-listings-123");
  await page.getByRole("button", { name: "Add company" }).click();
  await expect(page.getByRole("alert")).toContainText("Supported: Greenhouse, Lever");

  await page.getByRole("link", { name: "Jobs" }).click();
  await expect(page.getByTestId("job-count")).toHaveText("3 jobs");
});
