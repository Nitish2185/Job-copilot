/**
 * Phase 11 performance check: 10,000 jobs from the feed, ranked against a
 * profile. Sync, list, search, sort and scroll stay responsive, and the
 * heavier pages (tracker, analytics) open quickly. Budgets are generous for
 * CI machines; the timings are printed for the record.
 */
import { expect, publishFeed, test } from "./fixtures";
import { TEST_PROFILE, putRecords } from "./helpers";

const COUNT = 10_000;

test("stays responsive with 10,000 jobs", async ({ context, extensionId, server }) => {
  test.setTimeout(180_000);
  publishFeed(server, COUNT);
  const page = await context.newPage();
  const base = `chrome-extension://${extensionId}/dashboard.html`;
  await page.goto(`${base}#/settings`);
  await putRecords(page, { profile: [TEST_PROFILE] });
  const times: Record<string, number> = {};
  const time = async (name: string, run: () => Promise<void>) => {
    const start = Date.now();
    await run();
    times[name] = Date.now() - start;
  };

  await time("sync and rank", async () => {
    await page.getByLabel(/Feed address/).fill(`${server.url}/feed/`);
    await page.getByRole("button", { name: "Save and sync" }).click();
    await expect(page.getByRole("status")).toHaveText(/10000 open jobs/, { timeout: 90_000 });
  });

  await time("open jobs list", async () => {
    await page.goto(`${base}#/matches`);
    await page.getByTestId("job-count").waitFor();
  });
  // Show every score. Half the jobs are in the US, outside the profile's countries, so the
  // ranking over all 10,000 leaves 5,000 on the list.
  await page.getByLabel("Show all scores").check();
  await expect(page.getByTestId("job-count")).toHaveText("5,000 jobs", { timeout: 30_000 });
  const rendered = await page.getByTestId("job-row").count();
  expect(rendered).toBeLessThan(100);

  await time("search", async () => {
    await page.getByLabel("Search jobs").fill("Data Scientist");
    await expect(page.getByTestId("job-count")).toHaveText("1,000 jobs");
  });
  await time("clear search", async () => {
    await page.getByLabel("Search jobs").fill("");
    await expect(page.getByTestId("job-count")).toHaveText("5,000 jobs");
  });
  await time("sort by company", async () => {
    await page.getByLabel("Sort by").selectOption({ label: "Company" });
    await expect(page.getByTestId("job-row").first()).toBeVisible();
  });
  await time("scroll to the end", async () => {
    const list = page.getByTestId("job-list");
    await list.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.waitForTimeout(100);
    expect(await page.getByTestId("job-row").count()).toBeLessThan(100);
  });
  for (const route of ["tracker", "analytics"]) {
    await time(`open ${route}`, async () => {
      await page.goto(`${base}#/${route}`);
      await page.getByRole("heading", { level: 1 }).waitFor();
      await page.waitForLoadState("networkidle");
    });
  }

  console.log(`10,000-job timings (ms): ${JSON.stringify(times)}`);
  expect(times["sync and rank"]).toBeLessThan(60_000);
  expect(times.search).toBeLessThan(3_000);
  expect(times["clear search"]).toBeLessThan(3_000);
  expect(times["sort by company"]).toBeLessThan(3_000);
  expect(times["open analytics"]).toBeLessThan(5_000);
});
