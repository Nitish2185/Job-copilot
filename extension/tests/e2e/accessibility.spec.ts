/**
 * Phase 11 accessibility pass: axe (WCAG 2.1 A and AA) on every dashboard page,
 * the side panel and the popup, in light and dark, with data on screen.
 */
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { TEST_PROFILE, putRecords } from "./helpers";

const jobs = Array.from({ length: 6 }, (_, i) => ({
  id: `lever:acme:${String(i)}`,
  platform: i % 2 ? "lever" : "naukri",
  source: "feed",
  company: { name: `Acme ${String(i)}`, token: "acme" },
  title: i % 2 ? "Backend Engineer" : "React Developer",
  locations: ["Pune, India"],
  remote: "hybrid",
  countryCodes: ["IN"],
  url: `https://jobs.lever.co/acme/${String(i)}`,
  applyUrl: `https://jobs.lever.co/acme/${String(i)}`,
  firstSeenAt: "2026-10-20T00:00:00Z",
  skills: ["react", "go"],
  snippet: "Build things.",
  mode: i % 2 ? "auto" : "assist",
  dedupeKey: `acme ${String(i)}|engineer|pune`,
  status: i < 3 ? "applied" : "new",
}));

const scores = jobs.map((j, i) => ({
  jobId: j.id,
  profileVersion: 1,
  prefilter: {
    score: 50 + i * 8,
    matchedSkills: ["react"],
    missingSkills: ["go"],
    passed: true,
    reasons: ["Matches React"],
  },
  final: 50 + i * 8,
  isEstimate: true,
  scoredAt: "2026-10-21T00:00:00Z",
}));

const applications = jobs.slice(0, 3).map((j, i) => ({
  id: `app-${String(i)}`,
  jobId: j.id,
  mode: j.mode,
  status: i === 2 ? "needs_you" : "submitted",
  stage: i === 1 ? "interview" : "applied",
  resumeChoice: "current",
  answersSent: [{ question: "Notice period", answer: "30 days", source: "profile" }],
  submittedAt: "2026-10-22T10:00:00Z",
  notes: "",
  events: [{ at: "2026-10-22T10:00:00Z", type: "submitted" }],
  ...(i === 2 && { needsYouReason: "captcha", needsYouDetail: "Please solve the CAPTCHA." }),
}));

const ROUTES = [
  "matches",
  `jobs/${encodeURIComponent(jobs[1]?.id ?? "")}`,
  "review",
  "needs-you",
  "tracker",
  "analytics",
  "answers",
  "resumes",
  "profile",
  "companies",
  "settings",
  "onboarding",
];

async function violations(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return result.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes
      .slice(0, 6)
      .map(
        (n) =>
          `${n.target.join(" ")} :: ${n.html.slice(0, 120)} :: ${(n.failureSummary ?? "").replace(/\s+/g, " ").slice(0, 160)}`,
      ),
  }));
}

for (const scheme of ["light", "dark"] as const) {
  test(`has no WCAG A/AA violations (${scheme})`, async ({ context, extensionId }) => {
    test.setTimeout(120_000);
    const page = await context.newPage();
    await page.emulateMedia({ colorScheme: scheme });
    const base = `chrome-extension://${extensionId}`;
    await page.goto(`${base}/dashboard.html#/matches`);
    await putRecords(page, {
      profile: [TEST_PROFILE],
      jobs,
      scores,
      applications,
    });
    // Light is the default theme; the dark run picks Dark in Settings > Appearance.
    await page.evaluate(async (theme) => {
      const { chrome } = globalThis as unknown as {
        chrome: { storage: { sync: { set: (v: unknown) => Promise<void> } } };
      };
      await chrome.storage.sync.set({ settings: { ui: { theme } } });
    }, scheme);
    const found: Record<string, unknown[]> = {};
    for (const route of ROUTES) {
      await page.goto(`${base}/dashboard.html#/${route}`);
      await page.reload();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(400);
      await expect(page.locator("html")).toHaveAttribute("data-theme", scheme);
      const v = await violations(page);
      if (v.length) found[route] = v;
    }
    for (const extra of ["sidepanel.html", "popup.html"]) {
      await page.goto(`${base}/${extra}`);
      await page.waitForTimeout(400);
      const v = await violations(page);
      if (v.length) found[extra] = v;
    }
    expect(found, JSON.stringify(found, null, 2)).toEqual({});
  });
}
