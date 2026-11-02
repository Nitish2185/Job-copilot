/// <reference types="node" />
/**
 * Phase 9 acceptance: the Naukri site script on fixture pages. Requests to
 * www.naukri.com are answered by Playwright from local fixture HTML (nothing
 * reaches the real site): search-result badges and their Save button, the
 * logged-out banner instead of filling, save-from-page, and confirmation
 * detection recording the application.
 */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { TEST_PROFILE, putRecords, readAll, waitFor } from "./helpers";

const SEARCH_URL = "https://www.naukri.com/react-jobs-in-pune";
const JOB_URL =
  "https://www.naukri.com/job-listings-react-developer-acme-pune-3-to-5-years-311025001234";

const SEARCH = `<!doctype html><html><head><title>React Jobs in Pune</title></head><body>
  <div class="list">
    <div class="srp-jobtuple-wrapper">
      <a class="title" href="${JOB_URL}">React Developer</a>
      <a class="comp-name">Acme Technologies</a><span class="locWdth">Pune</span>
    </div>
    <div class="srp-jobtuple-wrapper">
      <a class="title" href="https://www.naukri.com/job-listings-java-lead-globex-chennai-311025009999">Java Lead</a>
      <a class="comp-name">Globex</a><span class="locWdth">Chennai</span>
    </div>
  </div></body></html>`;

const JOB = `<!doctype html><html><head><title>React Developer - Acme</title></head><body>
  <header><a id="login_Layer" href="#">Login</a></header>
  <h1 class="jd-header-title">React Developer</h1>
  <div class="jd-header-comp-name"><a>Acme Technologies</a></div>
  <div class="location"><a>Pune</a></div>
  <section class="job-desc"><p>3-5 years building React and TypeScript apps.</p></section>
  <div id="status"></div>
  <form><label for="q">Why do you want this role?</label><input id="q"></form>
</body></html>`;

interface Chrome {
  tabs: { query: (q: { url: string }) => Promise<{ id?: number }[]> };
  runtime: {
    sendMessage: (m: unknown) => Promise<{ ok: boolean; data?: unknown; error?: string }>;
  };
}

/** Sends a background message from the dashboard about the tab showing `url`. */
async function askAboutTab(dashboard: Page, url: string, type: string, extra = {}) {
  return dashboard.evaluate(
    async ([pageUrl, messageType, payload]) => {
      const { chrome } = globalThis as unknown as { chrome: Chrome };
      const [tab] = await chrome.tabs.query({ url: pageUrl });
      return chrome.runtime.sendMessage({
        type: messageType,
        payload: { tabId: tab?.id, ...payload },
      });
    },
    [url, type, extra] as const,
  );
}

test("Naukri: badges, logged-out banner, save from page and confirmation", async ({
  context,
  extensionId,
}) => {
  await context.route("https://www.naukri.com/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path.startsWith("/job-listings-react") ? JOB : SEARCH;
    return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body });
  });

  const dashboard = await context.newPage();
  await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html#/matches`);
  await putRecords(dashboard, { profile: [TEST_PROFILE] });

  // Search results: one badge per card, from the cards already on the page.
  const search = await context.newPage();
  await search.goto(SEARCH_URL);
  const badges = search.locator("job-copilot-badge");
  await expect(badges).toHaveCount(2);
  await expect(badges.first()).toContainText("Match");
  await expect(badges.first()).toContainText("React");

  // The badge's Save button saves the card without opening the job.
  await badges.first().getByRole("button", { name: "Save" }).click();
  await expect(badges.first().getByRole("button", { name: "Saved" })).toBeVisible();
  expect(search.url()).toBe(SEARCH_URL);
  const saved = await waitFor(async () => {
    const jobs = await readAll<{ title: string; status: string; url: string }>(dashboard, "jobs");
    return jobs.find((j) => j.title === "React Developer");
  });
  expect(saved).toMatchObject({ status: "saved", url: JOB_URL });

  // Job page, logged out: Autofill shows the banner and fills nothing.
  const job = await context.newPage();
  await job.goto(JOB_URL);
  await job.waitForTimeout(500);
  const fill = await askAboutTab(dashboard, `${JOB_URL}*`, "apply/autofillTab");
  expect(fill.ok).toBe(true);
  expect((fill.data as { error?: string }).error).toContain("logged out of Naukri");
  await expect(job.locator("job-copilot-banner")).toContainText(
    "You're logged out of Naukri. Please log in, then press Autofill again.",
  );
  await expect(job.locator("#q")).toHaveValue("");

  // Save from the job page: read from the page's own markup.
  const fromPage = await askAboutTab(dashboard, `${JOB_URL}*`, "jobs/saveFromTab");
  expect(fromPage.data).toMatchObject({ title: "React Developer", created: false });
  const full = await waitFor(async () => {
    const jobs = await readAll<{ title: string; description?: { text: string } }>(
      dashboard,
      "jobs",
    );
    return jobs.find((j) => j.title === "React Developer");
  });
  expect(full.title).toBe("React Developer");

  // The user applies on the site; its confirmation message records the application.
  await job.evaluate(() => {
    const status = document.getElementById("status");
    if (status)
      status.innerHTML = '<div class="apply-status-header">Applied to React Developer</div>';
  });
  const application = await waitFor(async () => {
    const apps = await readAll<{ jobId: string; mode: string; status: string }>(
      dashboard,
      "applications",
    );
    return apps[0];
  });
  expect(application).toMatchObject({ mode: "assist", status: "submitted" });
});
