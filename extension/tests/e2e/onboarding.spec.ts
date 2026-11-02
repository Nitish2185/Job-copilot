/// <reference types="node" />
/**
 * Phase 4 acceptance: full onboarding with a fictional resume and a mocked AI
 * provider on localhost, and the same flow with AI skipped. GitHub answers come
 * from routed fixtures; nothing real is contacted.
 */
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { expect, publishFeed, test, type FixtureServer, type MockAiServer } from "./fixtures";

const RESUME_PDF = fileURLToPath(new URL("../fixtures/resume-fictional.pdf", import.meta.url));

/** What the mock AI "reads" from the fictional resume. */
const DRAFT = {
  headline: "Full-stack developer",
  summary: "Full-stack developer with 4 years of experience building React and Node.js apps.",
  city: "Pune",
  country: "India",
  skills: [{ name: "React" }, { name: "TypeScript" }, { name: "Node.js" }, { name: "Redis" }],
  experience: [
    {
      company: "Example Fintech Pvt Ltd",
      title: "Software Engineer",
      startDate: "2022-07",
      endDate: null,
      bullets: ["Built payment dashboards with React, TypeScript and Node.js"],
    },
    {
      company: "Sample Labs",
      title: "Junior Developer",
      startDate: "2020-06",
      endDate: "2022-06",
      bullets: ["Developed REST APIs in Express and MongoDB"],
    },
  ],
  education: [
    {
      institution: "Example Institute of Technology",
      degree: "B.Tech",
      field: "Computer Science",
      startYear: 2016,
      endYear: 2020,
    },
  ],
  projects: [
    {
      name: "Job Board",
      description: "A job listing app built with Next.js and PostgreSQL",
      bullets: [],
      techStack: ["Next.js", "PostgreSQL"],
    },
  ],
  certifications: [],
  languages: [],
  achievements: [],
  uncertainFields: ["experience[1].startDate"],
};

const DESCRIPTION = {
  description: "A job listing web app with search and filters.",
  bullets: ["Lists jobs from a PostgreSQL database", "Server-rendered pages with Next.js"],
  techStack: ["Next.js", "PostgreSQL", "TypeScript"],
};

const ANALYSIS = {
  mustHave: ["React", "TypeScript"],
  niceToHave: ["Node.js"],
  keywords: ["React", "TypeScript", "web apps"],
  seniority: "mid",
  responsibilitiesSummary: "Build React apps.",
};

/** The mock AI's tailoring: honest rewording plus one invented number the validator must catch. */
const TAILORING = {
  summary: "Full-stack developer focused on React and TypeScript web apps.",
  skillsOrder: ["react", "typescript", "nodejs"],
  experienceRewrites: [
    {
      experienceKey: "e1",
      bulletIndex: 0,
      text: "Built payment dashboards used by 2 million people with React",
    },
  ],
  experienceBulletOrder: [],
  projectBullets: [
    {
      projectKey: "p1",
      bullets: ["Lists jobs from a PostgreSQL database", "Server-rendered pages with Next.js"],
    },
  ],
  keywordsTargeted: ["React", "TypeScript"],
};

const GITHUB_REPOS = [
  {
    full_name: "aarav-dev/job-board",
    name: "job-board",
    description: "Job listing app",
    language: "TypeScript",
    stargazers_count: 4,
    forks_count: 0,
    fork: false,
    archived: false,
    pushed_at: "2026-10-20T10:00:00Z",
    html_url: "https://github.com/aarav-dev/job-board",
    homepage: null,
    topics: ["nextjs"],
  },
  {
    full_name: "aarav-dev/dotfiles",
    name: "dotfiles",
    description: "Forked config",
    language: "Shell",
    stargazers_count: 0,
    forks_count: 0,
    fork: true,
    archived: false,
    pushed_at: "2025-01-01T10:00:00Z",
    html_url: "https://github.com/aarav-dev/dotfiles",
    homepage: null,
    topics: [],
  },
];

async function routeGithub(page: Page): Promise<void> {
  await page.context().route(/^https:\/\/api\.github\.com\//, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/users/aarav-dev/repos") {
      return route.fulfill({
        json: GITHUB_REPOS,
        headers: { "x-ratelimit-remaining": "57" },
      });
    }
    if (url.pathname === "/repos/aarav-dev/job-board/languages") {
      return route.fulfill({ json: { TypeScript: 5000, CSS: 300 } });
    }
    if (url.pathname === "/repos/aarav-dev/job-board/readme") {
      return route.fulfill({ body: "# Job Board\nA job listing app built with Next.js." });
    }
    return route.fulfill({ status: 404, json: { message: "Not Found" } });
  });
}

interface ChromeStorage {
  storage: {
    sync: {
      get: (key: string) => Promise<Record<string, unknown>>;
      set: (items: Record<string, unknown>) => Promise<void>;
    };
  };
}

/** Points the extension at the local fixture feed without starting a sync. */
async function useLocalFeed(page: Page, server: FixtureServer): Promise<void> {
  publishFeed(server, 40);
  await page.evaluate(async (feedBaseUrl) => {
    const { chrome } = globalThis as unknown as { chrome: ChromeStorage };
    const stored = (await chrome.storage.sync.get("settings")).settings as
      Record<string, Record<string, unknown>> | undefined;
    await chrome.storage.sync.set({
      settings: { ...stored, sources: { ...stored?.sources, feedBaseUrl } },
    });
  }, `${server.url}/feed/`);
}

/** Reads one record straight from the extension's IndexedDB. */
async function readRecord(page: Page, store: string, key: string): Promise<unknown> {
  return page.evaluate(
    ([storeName, id]) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("job-copilot");
        open.onerror = () => {
          reject(open.error ?? new Error("open failed"));
        };
        open.onsuccess = () => {
          const request = open.result
            .transaction(storeName, "readonly")
            .objectStore(storeName)
            .get(id);
          request.onsuccess = () => {
            resolve(request.result);
            open.result.close();
          };
          request.onerror = () => {
            reject(request.error ?? new Error("read failed"));
          };
        };
      }),
    [store, key] as const,
  );
}

async function openOnboarding(page: Page, extensionId: string): Promise<void> {
  await page.goto(`chrome-extension://${extensionId}/dashboard.html#/onboarding`);
  await expect(page.getByRole("heading", { level: 1, name: "Welcome" })).toBeVisible();
  await page.getByRole("button", { name: "Get started" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "AI setup" })).toBeVisible();
}

async function finishAfterResume(page: Page, viaGithub: boolean): Promise<void> {
  await expect(page.getByRole("heading", { level: 1, name: "GitHub projects" })).toBeVisible();
  if (viaGithub) {
    await expect(page.getByLabel("GitHub username")).toHaveValue("aarav-dev");
    await page.getByRole("button", { name: "Find my repositories" }).click();
    await expect(page.getByText("57 GitHub requests left this hour")).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /job-board/ })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: /dotfiles/ })).not.toBeChecked();
    await page.getByRole("button", { name: "Import 1 project" }).click();
    await page.getByRole("button", { name: "Save projects and continue" }).click();
  } else {
    await page.getByRole("button", { name: "Skip" }).click();
  }

  await expect(page.getByRole("heading", { level: 1, name: "Other projects" })).toBeVisible();
  await page.getByRole("button", { name: "Skip" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Common questions" })).toBeVisible();
  await page.getByLabel("Current CTC").fill("12 LPA");
  await page.getByLabel("Notice period (days)").fill("60");
  await page.getByRole("button", { name: "Save and continue" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Jobs you want" })).toBeVisible();
  await page.getByLabel("Desired roles").fill("Full Stack Developer, Frontend Developer");
  await page.getByRole("button", { name: "Save and continue" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "How applying works" })).toBeVisible();
  await page.getByLabel("A resume tailored to each job").check();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Done" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("40 open jobs ready.", { timeout: 30_000 });
  await page.getByRole("button", { name: "See my matches" }).click();
  await expect(page).toHaveURL(/#\/matches$/);
}

/** The mock AI's answer to a scoreJobs request: every job key in the request scores 85. */
function scoreReply(body: string): unknown {
  const keys = new Set([...body.matchAll(/\\"key\\":\\"(j\d+)\\"/g)].map((m) => m[1]));
  return {
    scores: [...keys].map((key) => ({
      key,
      score: 85,
      verdict: "strong",
      mustHave: [{ skill: "React", met: true }],
      niceToHave: [],
      experienceFit: "fit",
      locationFit: true,
      salaryFit: null,
      reasons: ["Uses React and TypeScript"],
      redFlags: [],
    })),
  };
}

function expectRedacted(ai: MockAiServer): void {
  expect(ai.chatBodies.length).toBeGreaterThan(0);
  for (const body of ai.chatBodies) {
    expect(body).not.toMatch(/Aarav|Mehta|aarav\.mehta@example\.com|99999|aarav-dev/i);
  }
}

test("onboards with a fictional resume and a mocked AI provider", async ({
  context,
  extensionId,
  server,
  aiServer,
}) => {
  aiServer.reply = (body) => {
    if (body.includes("resume into structured profile")) return DRAFT;
    if (body.includes("describe a software project")) return DESCRIPTION;
    if (body.includes("rate how well each job fits")) return scoreReply(body);
    if (body.includes("You analyze a software job description")) return ANALYSIS;
    if (body.includes("You tailor a resume to one job")) return TAILORING;
    return { ok: true };
  };
  const page = await context.newPage();
  await routeGithub(page);
  await openOnboarding(page, extensionId);
  await useLocalFeed(page, server);

  // AI setup with a custom OpenAI-compatible provider on localhost.
  await page.getByLabel("Provider", { exact: true }).selectOption("custom");
  await page.getByLabel("Address (OpenAI-compatible)").fill(aiServer.baseUrl);
  await page.getByLabel("Model", { exact: true }).fill("mock-model");
  await page.getByRole("button", { name: "Save and test" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved. The AI provider answered.");
  await page.getByRole("button", { name: "Continue" }).click();

  // Resume: text and contacts are read locally, the name is confirmed, then the AI reads it.
  await expect(page.getByRole("heading", { level: 1, name: "Resume" })).toBeVisible();
  await page.getByLabel(/Your resume/).setInputFiles(RESUME_PDF);
  await expect(page.getByLabel("Your full name")).toHaveValue("Aarav Mehta");
  await expect(page.getByText("aarav.mehta@example.com")).toBeVisible();
  await page.getByRole("button", { name: "Read my resume with AI" }).click();
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue("Aarav Mehta");
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("aarav.mehta@example.com");
  await expect(page.locator("[data-uncertain]")).toHaveCount(1);
  await page.getByRole("button", { name: "Confirm and continue" }).click();

  await finishAfterResume(page, true);

  // Jobs are ranked: only good fits show by default, the best ones already scored by AI.
  await expect(page.getByLabel("Score 85", { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId("job-count")).not.toHaveText("40 jobs");
  await expect(page.getByTestId("ai-quota")).toContainText("AI scores left today");
  // Show all ignores the score, but the 20 US jobs stay out: the preferences ask for India.
  await page.getByLabel("Show all scores").check();
  await expect(page.getByTestId("job-count")).toHaveText("20 jobs");
  await page.getByRole("button", { name: "AI-score the next 20" }).click();
  await expect(page.getByRole("status")).toHaveText(/Scored \d+ jobs with AI\./);

  // Job detail: the full description is fetched from the (routed) Lever posting and sanitized.
  await page.context().route(/^https:\/\/api\.lever\.co\/v0\/postings\//, (route) =>
    route.fulfill({
      json: {
        id: new URL(route.request().url()).pathname.split("/").pop(),
        text: "Frontend Developer",
        hostedUrl: "https://jobs.lever.co/acme/x",
        applyUrl: "https://jobs.lever.co/acme/x/apply",
        createdAt: 1_793_000_000_000,
        categories: { location: "Bengaluru, India", commitment: "Full-time" },
        description:
          "<p>Build React apps for millions of users.</p><script>window.pwned = 1</script>",
        lists: [],
      },
    }),
  );
  const firstJob = page.getByTestId("job-row").first().getByRole("link");
  const title = (await firstJob.textContent()) ?? "";
  await firstJob.click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(page.getByTestId("job-description")).toContainText(
    "Build React apps for millions of users.",
  );
  await expect(page.locator("[data-testid=job-description] script")).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Reasons" })).toContainText(
    "Uses React and TypeScript",
  );

  // Tailored resume: honest changes are used, an invented number is rejected by the validator.
  await page.getByRole("link", { name: "Make a resume for this job" }).click();
  await expect(page.getByTestId("fit-info")).toHaveText(/1 page, 10\.5 pt/, { timeout: 30_000 });
  await expect(page.getByLabel("Summary", { exact: true })).toHaveValue(
    "Full-stack developer focused on React and TypeScript web apps.",
  );
  await expect(page.getByText("Reworded for this job").first()).toBeVisible();
  await expect(page.getByTestId("validation-issues")).toContainText(
    "adds numbers that are not in your profile (2)",
  );
  await expect(page.getByTitle("Resume preview")).toBeVisible();
  await page
    .getByLabel("Summary", { exact: true })
    .fill("Full-stack developer who ships React apps.");
  await page.getByRole("button", { name: "Update preview" }).click();
  await page.getByRole("button", { name: "Save this resume" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved. You can find it on the Resumes page.");
  await page.getByRole("link", { name: "Resumes", exact: true }).click();
  await expect(page.getByTestId("tailored-list").getByRole("listitem")).toHaveCount(1);
  await page.getByRole("button", { name: "Generate a clean base resume from my profile" }).click();
  await expect(page.getByRole("status")).toHaveText("A clean resume was made from your profile.", {
    timeout: 30_000,
  });

  await page.getByRole("link", { name: "Jobs", exact: true }).click();
  // Filters are kept while visiting a job.
  await expect(page.getByLabel("Show all scores")).toBeChecked();

  expectRedacted(aiServer);
  const profile = (await readRecord(page, "profile", "me")) as {
    basics: { fullName: string; email: string; country: string; githubUsername?: string };
    experience: unknown[];
    projects: { name: string; source: string; links: { repo?: string }; bullets: string[] }[];
    baseResume?: { fileName: string };
  };
  expect(profile.basics).toMatchObject({
    fullName: "Aarav Mehta",
    email: "aarav.mehta@example.com",
    country: "IN",
    githubUsername: "aarav-dev",
  });
  expect(profile.experience).toHaveLength(2);
  expect(profile.baseResume?.fileName).toBe("resume-fictional.pdf");
  // The GitHub repo merged into the resume's "Job Board" project instead of duplicating it.
  expect(profile.projects).toHaveLength(1);
  expect(profile.projects[0]?.links.repo).toBe("https://github.com/aarav-dev/job-board");
  expect(profile.projects[0]?.bullets).toEqual(DESCRIPTION.bullets);

  const preferences = (await readRecord(page, "preferences", "me")) as {
    currentCtc?: { amount: number; currency: string };
    noticePeriodDays: number;
    desiredRoles: string[];
  };
  expect(preferences.currentCtc).toEqual({ amount: 1_200_000, currency: "INR", period: "year" });
  expect(preferences.noticePeriodDays).toBe(60);
  expect(preferences.desiredRoles).toEqual(["Full Stack Developer", "Frontend Developer"]);
});

test("onboards with AI skipped, filling the profile by hand", async ({
  context,
  extensionId,
  server,
  aiServer,
}) => {
  const page = await context.newPage();
  await openOnboarding(page, extensionId);
  await useLocalFeed(page, server);
  await page.getByRole("button", { name: "Skip for now" }).click();

  await page.getByLabel(/Your resume/).setInputFiles(RESUME_PDF);
  await expect(page.getByLabel("Your full name")).toHaveValue("Aarav Mehta");
  await expect(page.getByRole("button", { name: "Read my resume with AI" })).toHaveCount(0);
  await page.getByRole("button", { name: "Fill in by hand" }).click();

  // The resume text is shown beside the editor; contacts were filled locally.
  await expect(page.getByRole("region", { name: "Resume text" })).toContainText("Example Fintech");
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("aarav.mehta@example.com");
  await page.getByLabel("Headline").fill("Full-stack developer");
  await page.getByRole("button", { name: "Confirm and continue" }).click();

  await finishAfterResume(page, false);
  // Without skills in the profile jobs are not ranked yet, so every job shows.
  await expect(page.getByTestId("job-count")).toHaveText("40 jobs");

  expect(aiServer.chatBodies).toHaveLength(0);
  const profile = (await readRecord(page, "profile", "me")) as {
    basics: { fullName: string; phone: string };
    headline?: string;
    version: number;
  };
  expect(profile.basics.fullName).toBe("Aarav Mehta");
  expect(profile.basics.phone).toContain("99999");
  expect(profile.headline).toBe("Full-stack developer");

  // Everything stays editable later on the Profile page; each save bumps the version.
  const before = profile.version;
  await page.getByRole("link", { name: "Profile", exact: true }).click();
  await page.getByLabel("Headline").fill("Full-stack developer (React, Node.js)");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("status")).toHaveText(
    `Saved. Profile version ${String(before + 1)}.`,
  );
  await page.getByRole("tab", { name: "Answers and job preferences" }).click();
  await expect(page.getByLabel("Current CTC")).toHaveValue("12 LPA");
});
