/// <reference types="node" />
/**
 * Phase 7 acceptance: autofill on a local fixture form fills correctly, and
 * Assist mode never clicks a forbidden control. Nothing real is contacted.
 */
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const FORM = readFileSync(new URL("./forms/application.html", import.meta.url), "utf8");

const PROFILE = {
  id: "me",
  version: 1,
  basics: {
    fullName: "Aarav Mehta",
    email: "aarav.mehta@example.com",
    phone: "+91 99999 01234",
    city: "Pune",
    state: "Maharashtra",
    country: "IN",
    linkedinUrl: "https://linkedin.com/in/aarav-mehta-example",
    githubUsername: "aarav-dev",
    otherLinks: [],
  },
  headline: "Full-stack developer",
  summary: "Full-stack developer with 4 years of experience.",
  skills: [{ id: "react", displayName: "React", years: 3, source: "resume" }],
  experience: [],
  totalExperienceMonths: 53,
  education: [],
  projects: [],
  certifications: [],
  languages: [],
  achievements: [],
  baseResume: {
    fileName: "Aarav_Mehta_Resume.pdf",
    mimeType: "application/pdf",
    fileId: "resume-file",
    extractedText: "Aarav Mehta",
    uploadedAt: "2026-11-01T00:00:00Z",
  },
  updatedAt: "2026-11-01T00:00:00Z",
};

const PREFERENCES = {
  id: "me",
  workAuthorization: [{ countryCode: "IN", status: "citizen" }],
  needsSponsorship: false,
  noticePeriodDays: 60,
  noticeNegotiable: true,
  currentCtc: { amount: 1_250_000, currency: "INR", period: "year" },
  expectedCtc: { min: 1_800_000, currency: "INR", period: "year" },
  salaryDisclosure: "share",
  preferredLocations: [],
  remotePreference: "any",
  willingToRelocate: true,
  desiredRoles: ["Full Stack Developer"],
  experienceLevel: "mid",
  jobTypes: ["full_time"],
  countries: ["IN"],
  excludeTitleKeywords: [],
  hiddenCompanies: [],
};

/** Writes the profile, preferences and resume file straight into the extension's database. */
async function seed(page: Page): Promise<void> {
  await page.evaluate(
    async ([profile, preferences]) => {
      // Wait until the dashboard has created the database.
      await new Promise((r) => setTimeout(r, 300));
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("job-copilot");
        open.onerror = () => {
          reject(open.error ?? new Error("open"));
        };
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(["profile", "preferences", "files"], "readwrite");
          tx.objectStore("profile").put(profile);
          tx.objectStore("preferences").put(preferences);
          tx.objectStore("files").put({
            id: "resume-file",
            name: "Aarav_Mehta_Resume.pdf",
            mimeType: "application/pdf",
            blob: new Blob(["%PDF-1.4 fixture"], { type: "application/pdf" }),
            createdAt: "2026-11-01T00:00:00Z",
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            reject(tx.error ?? new Error("tx"));
          };
        };
      });
    },
    [PROFILE, PREFERENCES] as const,
  );
}

interface Chrome {
  tabs: { query: (q: { url: string }) => Promise<{ id?: number }[]> };
  runtime: {
    sendMessage: (m: unknown) => Promise<{ ok: boolean; data?: unknown; error?: string }>;
  };
}

/** Asks the background to autofill the fixture tab, as the side panel button does. */
async function autofill(dashboard: Page, formUrl: string) {
  return dashboard.evaluate(async (url) => {
    const { chrome } = globalThis as unknown as { chrome: Chrome };
    const [tab] = await chrome.tabs.query({ url: `${url}*` });
    return chrome.runtime.sendMessage({ type: "apply/autofillTab", payload: { tabId: tab?.id } });
  }, formUrl);
}

test("fills a fixture application form and never clicks forbidden controls", async ({
  context,
  extensionId,
  server,
}) => {
  server.files.set("/apply.html", FORM);
  const dashboard = await context.newPage();
  await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html#/settings`);
  await seed(dashboard);

  const form = await context.newPage();
  await form.goto(`${server.url}/apply.html`);
  const reply = await autofill(dashboard, `${server.url}/apply.html`);
  expect(reply).toMatchObject({ ok: true });
  const result = reply.data as { filled: number; needsYou: number; error?: string };
  expect(result.error).toBeUndefined();
  expect(result.filled).toBeGreaterThan(8);

  // Values from the profile and preferences.
  await expect(form.locator("#first")).toHaveValue("Aarav");
  await expect(form.locator("#last")).toHaveValue("Mehta");
  await expect(form.locator("#email")).toHaveValue("aarav.mehta@example.com");
  await expect(form.locator("#dial")).toHaveValue("+91");
  await expect(form.locator("#phone")).toHaveValue("9999901234");
  await expect(form.locator("#city")).toHaveValue("Pune, Maharashtra, India");
  await expect(form.locator("#linkedin")).toHaveValue(
    "https://linkedin.com/in/aarav-mehta-example",
  );
  await expect(form.locator("#ctc")).toHaveValue("12.5");
  await expect(form.locator("#notice")).toHaveValue("2 months");
  await expect(form.locator("#rel-yes")).toBeChecked();
  await expect(form.locator('input[name=sponsor][value="no"]')).toBeChecked();
  await expect(form.locator("#gender")).toHaveValue("Decline to self-identify");
  await expect(form.locator("#country")).toHaveText("India");
  await expect(form.locator("#resume-name")).toHaveText("Aarav_Mehta_Resume.pdf");
  // React-style forms saw the value through an input event.
  expect(
    await form.evaluate(
      () => (window as unknown as { seenByForm: { city?: string } }).seenByForm.city,
    ),
  ).toBe("Pune, Maharashtra, India");
  // The follow-up question revealed by "Yes" was found in a later pass.
  await expect(form.locator("#pref-city")).toBeAttached();

  // Never filled: consent, disabled, hidden honeypot, the chatbot, unknown or other-currency questions.
  await expect(form.locator("#privacy")).not.toBeChecked();
  await expect(form.locator("#disabled")).toHaveValue("");
  await expect(form.locator("#website")).toHaveValue("");
  await expect(form.locator("[aria-label='Type your answer']")).toHaveValue("");
  await expect(form.locator("#salary")).toHaveValue("");
  await expect(form.locator("#why")).toHaveValue("");

  // No forbidden click happened, and the page did not submit or navigate.
  expect(
    await form.evaluate(() => (window as unknown as { forbiddenClicks: string[] }).forbiddenClicks),
  ).toEqual([]);
  expect(form.url()).toBe(`${server.url}/apply.html`);

  // Highlights and the panel, then undo.
  await expect(form.locator("#first")).toHaveAttribute("data-jc-highlight", "filled");
  await expect(form.locator("#salary")).toHaveAttribute("data-jc-highlight", "needs_you");
  const panel = form
    .locator("job-copilot-overlay")
    .getByRole("region", { name: "Job Copilot autofill" });
  await expect(panel).toContainText("need you");
  await panel.getByRole("button", { name: "Undo autofill" }).click();
  await expect(form.locator("#first")).toHaveValue("");
  await expect(form.locator("job-copilot-overlay")).toHaveCount(0);

  // The report is kept for the side panel.
  const report = await dashboard.evaluate(async (url) => {
    const { chrome } = globalThis as unknown as { chrome: Chrome };
    const [tab] = await chrome.tabs.query({ url: `${url}*` });
    return chrome.runtime.sendMessage({ type: "apply/lastReport", payload: { tabId: tab?.id } });
  }, `${server.url}/apply.html`);
  expect(JSON.stringify(report)).toContain("Current CTC (in LPA)");
});
