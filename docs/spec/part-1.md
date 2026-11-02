# Job Copilot - Full Build Specification
## PART 1 of 3 - Overview, rules, architecture, tech stack, data model, Go crawler

> **Instructions for Claude Code (read this first)**
>
> This specification is split into 3 parts (PART 1, PART 2, PART 3) only because of message size limits. Together they are ONE specification, and every part is equally binding.
>
> - **If you received this part as a pasted message:** create the project folder if needed, save this part verbatim to `docs/spec/part-1.md`, then reply only: "Part 1 of 3 saved - send Part 2." Do not write any other code yet.
> - **If you were asked to read the parts from files:** read all three files completely before doing anything else.
> - Do not start building until you have all 3 parts. PART 3 ends with the start signal.

---

## 0. Your role and how to work

You are building a complete, production-quality, open-source project from scratch: a cross-browser extension, a Go crawler, a static website, CI/CD, tests, and docs. Treat this as a large project that will be worked on across many sessions.

Working rules:

1. **Keep the spec on disk.** All three parts must exist verbatim in `docs/spec/part-1.md`, `part-2.md`, `part-3.md`. Re-read the relevant section before implementing it. If your context gets summarized, re-read the spec files instead of relying on memory.
2. **Requirements checklist.** Before writing code, create `docs/REQUIREMENTS.md`: a checklist with one line per requirement from all three parts, grouped by section number (for example `- [ ] 2.3 Never request the cookies permission`). Tick items as you implement them. At the end, every item must be ticked or listed under "Deferred" with a reason.
3. **Progress log.** Keep `docs/PROGRESS.md` updated: current phase, what is done, what is next, known issues. Anyone (including a future you) must be able to continue from it.
4. **Decisions log.** When you choose something the spec leaves open, write it in `docs/DECISIONS.md` with a one-line reason. Do not stop to ask about small choices; pick sensible defaults.
5. **Work in phases** (PART 3, section 24). Finish a phase, run its checks, update the docs, then commit with a clear message. Initialize git in Phase 0. **Never** push to a remote, create GitHub repositories, change GitHub settings, or publish to any store yourself; write the exact steps for the user instead.
6. **Verify before you use.** Library APIs change. Before using a library, check its current docs and pin exact versions in `package.json` and `go.mod`. Before writing a parser for an external API, make a real GET request, inspect the response, and save a trimmed copy as a test fixture. Field names in this spec are from memory and must be verified.
7. **Never submit a real job application** while developing or testing. Form fillers are tested only against local HTML fixtures.
8. **Code quality.** TypeScript `strict` mode, no `any` except at validated boundaries, ESLint + Prettier, small focused modules, meaningful names, comments only where they help a reader.
9. **Environment.** The user is on Windows. Use cross-platform scripts (Node scripts or `cross-env`, never bash-only npm scripts). In Phase 0, check prerequisites: Node.js LTS (22 or newer), pnpm, Go (latest stable), Git. If something is missing, tell the user exactly what to install and stop.
10. **Ask the user only when truly blocked** (for example, a missing prerequisite, or something only they can do). Otherwise keep going.

---

## 1. What we are building

**Name:** Job Copilot (working name). Keep the name in a single constant/config so it is easy to rename.

**One sentence:** A free, open-source, privacy-first job-hunting assistant for software developers, delivered as a browser extension (Chrome, Edge, Firefox) with a companion Go crawler, that finds jobs, ranks them against the user's skills, prepares tailored applications, auto-applies where that is allowed, and assists with one-click filling everywhere else.

### 1.1 What it does

1. **Finds jobs** from:
   - a shared job feed built by the Go crawler from public company job-board APIs (Greenhouse, Lever, Ashby, SmartRecruiters, Workable if verified),
   - the user's own list of companies (fetched directly by the extension),
   - optional job-listing APIs with the user's own keys (Adzuna, JSearch),
   - jobs the user saves from any page they are viewing (Naukri, Indeed, LinkedIn, anything),
   - job descriptions the user pastes manually.
2. **Ranks jobs** against the user's profile: a free local keyword prefilter, then AI scoring with reasons, must-have checklist, and missing skills.
3. **Prepares applications:** fills forms from the user's profile and a growing answer bank; optionally creates a resume tailored to the job (picks the 2 most relevant real projects) and a cover letter.
4. **Applies:**
   - **Auto mode** on public company application forms (Greenhouse, Lever, Ashby, Workable, SmartRecruiters): fills and submits in a background tab, either after the user approves or automatically above the user's score threshold.
   - **Assist mode** everywhere else (Naukri, Indeed, LinkedIn, Wellfound, Glassdoor, Foundit, Workday, iCIMS, Taleo, SuccessFactors, any custom site): fills the form; **the user clicks submit**.
5. **Tracks** every application with the exact resume and answers sent, follow-up reminders, pipeline stages, and analytics (including whether tailored resumes get more responses).

### 1.2 Key constraints

- **Free for unlimited users.** No backend server, no hosted database, no paid services. Everything runs on the user's device. The shared job feed is static JSON on GitHub Pages, built by a scheduled GitHub Actions workflow.
- **Bring your own key (BYOK).** Each user enters their own free AI key: Google Gemini by default, or Groq, OpenRouter, a local Ollama, or any OpenAI-compatible endpoint. Keys stay on the device.
- **Local-first.** All user data lives in the extension (IndexedDB + `chrome.storage`). Nothing leaves the device except (a) AI requests to the provider the user chose and (b) applications the user sends to employers.
- **Works without an AI key.** Keyword matching, profile-based autofill, tracking, and the base resume must work with no AI configured. AI features show a clear "Add an AI key to enable this" state.
- **Target users:** developers, with first-class support for India (Naukri, Indeed India, CTC in LPA, notice period questions) but working globally.

---

## 2. Non-negotiable rules

These rules override every other instruction, feature idea, or convenience in this spec. Implement them **in code**, not just in docs, and write tests for every rule that can be tested.

### 2.1 Assist-only sites: the extension never submits

Assist-only sites include: Naukri, Indeed, LinkedIn, Wellfound (AngelList), Glassdoor, Foundit (Monster), Instahyre, Hirist, Cutshort, Workday, iCIMS, Taleo/Oracle, SAP SuccessFactors, and **every site that is not in the Auto allowlist (2.2)**.

On these sites:

- The extension fills fields **only on a page the user opened themselves**, and only when the user presses the "Autofill" button or keyboard shortcut, or when the setting "Autofill each new step automatically" is on (default ON). That setting only fills fields on the tab the user is looking at; it never clicks or navigates.
- **Allowed:** interacting with individual form controls to set their value: focusing an input, typing a value, choosing a dropdown option, ticking a checkbox or radio button, opening a combobox to pick an option, attaching a file, clicking an "Add another" button that adds a repeatable form section (for example, another work-experience block).
- **Forbidden:** clicking anything that submits, advances, or navigates: Apply, Submit, Send, Continue, Next, Review, Save and continue, Done, links, chat "send" buttons, or option chips that submit a chatbot answer. Implement a guard `isNavigationOrSubmitControl(element)` and route every programmatic click through a single `safeClick()` function that refuses forbidden elements on Assist sites. Unit-test the guard with many real button labels and structures.
- The extension never opens the next job automatically, never loops through search results, and never works in background tabs on these sites.
- The extension makes **no network requests** to these sites itself: no scraping, no hidden fetches, no calls to their internal APIs. It only reads the DOM of pages the user has already loaded.
- Match badges on search-result pages are computed only from what the user's page has already loaded.

### 2.2 Auto allowlist (the only places the extension may submit)

```ts
export const AUTO_SUBMIT_HOSTS = [
  "boards.greenhouse.io",
  "job-boards.greenhouse.io",
  "jobs.lever.co",
  "jobs.eu.lever.co",
  "jobs.ashbyhq.com",
  "apply.workable.com",
  "jobs.smartrecruiters.com",
] as const;
```

- This list lives in one constant in the `shared` package.
- The single submit function must assert, right before clicking, that the current tab's hostname is exactly in this list, and throw otherwise. Unit-test this guard.
- Test builds may add a local fixture host through a build-time flag. A test must assert that production builds do not include it.
- Verify these hosts during development; if one has moved, update the constant and note it in `DECISIONS.md`.

### 2.3 Never

- **Never** ask for, store, or type passwords for any job site, and never log in for the user. Detect a logged-out state and show a banner asking the user to log in themselves. Never fill login or sign-up forms.
- **Never** request the `cookies` permission or read cookies.
- **Never** bypass, solve, or outsource CAPTCHAs or bot checks (reCAPTCHA, hCaptcha, Cloudflare Turnstile, or similar). If one appears: stop, mark the item "Needs you", notify the user.
- **Never** try to make automation look human: no fake mouse movements, no simulated typing delays meant to avoid detection, no browser-fingerprint changes, no proxies. Fill fields directly.
- **Never** fill in email or SMS verification codes. Stop and mark "Needs you".
- **Never** invent facts on resumes, cover letters, or answers (rules in PART 2, section 14).
- **Never** let the AI decide sensitive answers: work authorization, visa sponsorship, current or expected salary/CTC, notice period, background-check or criminal-record questions, relocation, legal attestations, date of birth. These come only from the user's profile or answer bank. If missing: stop, ask the user, save the answer to the answer bank.
- **Never** accept terms or consent checkboxes for the user, with one exception: the standard privacy-notice acknowledgement on Auto-allowlist forms, and only if the user turned on "Allow acknowledging standard privacy notices on company application forms" (default OFF). Otherwise mark "Needs you".
- **Never** fill hidden or disabled fields. Only visible, enabled fields.
- **Never** apply twice to the same job. Respect per-company and daily caps.
- **Auto-apply is OFF by default.** The user must turn it on, read and confirm a one-time explanation dialog, and set a score threshold.

### 2.4 Politeness limits

- Pause between automatic submissions: default 90 seconds, minimum 30, configurable.
- Daily cap on automatic submissions: default 20, maximum 50.
- Per-company cap: default 2 applications per 30 days, configurable.
- Crawler: clear `User-Agent` including the repository URL, limited concurrency per host, retries with backoff, honor `429` and `Retry-After`.

### 2.5 AI output and web content are untrusted

Job descriptions and page content are untrusted text and may contain prompt injection. Always wrap them in clearly delimited data sections, tell the model to ignore any instructions inside them, require JSON output validated with Zod, and never let AI output trigger actions directly. Code decides every action.

---

## 3. Architecture

```
+------------------------------- GitHub (free) --------------------------------+
| Actions (cron every 6h): Go crawler -> public ATS APIs -> tag skills          |
|   -> write feed (snapshot + daily deltas) -> commit state to `data` branch    |
|   -> deploy GitHub Pages: website + /feed/*.json                              |
+-------------------------------------------------------------------------------+
                 | HTTPS GET (index.json, snapshot.json, new daily files)
                 v
+--------------------------- Browser extension (WXT) --------------------------+
| Background service worker:                                                   |
|   feed sync (alarms) | personal company boards | optional listing APIs       |
|   matcher | AI client + scheduler | apply queue | notifications              |
| IndexedDB (Dexie): profile, projects, jobs, scores, applications,            |
|   resume versions (PDF blobs), queue, companies, AI cache                    |
| chrome.storage: settings + answer bank mirror (sync), API keys (local only)  |
| UI: Dashboard (full tab) | Side panel | Popup | Onboarding wizard            |
| Content scripts:                                                             |
|   Auto adapters: greenhouse, lever, ashby, workable, smartrecruiters         |
|   Assist adapters: naukri, indeed, linkedin, workday, generic                |
|   Search-page badges: naukri, indeed, linkedin                               |
+------------------------------------------------------------------------------+
                 | user's own key
                 v
     AI provider (Gemini default | Groq | OpenRouter | Ollama | custom)
```

There is no server of ours anywhere. Do not add one.

---

## 4. Tech stack

Use the latest stable versions at build time and pin exact versions.

| Area | Choice | Notes |
|---|---|---|
| Monorepo | **pnpm workspaces** | Packages: `extension`, `site`, `shared`. Go module in `crawler/`. |
| Extension framework | **WXT** + TypeScript (strict) | Builds Chrome/Edge (MV3) and Firefox from one codebase. Use WXT's `browser` API wrapper. |
| UI | **React** + **Tailwind CSS** | Accessible primitives from **Radix UI**; icons from **lucide-react**. Keep reusable components in `extension/components/ui`. |
| UI on job sites | WXT `createShadowRootUi` | Badges, overlays, and banners live in Shadow DOM so site CSS cannot break them and ours cannot break the site. |
| Routing (dashboard) | **react-router** with a hash router | Extension pages need hash routing. |
| UI state | **Zustand** for UI-only state | Database-backed state via Dexie live queries. |
| Local database | **Dexie.js** (IndexedDB) + `dexie-react-hooks` | Versioned schema with migrations. |
| Forms | **react-hook-form** + Zod resolver | |
| Validation | **Zod** | One source of truth for all schemas; export JSON Schema from Zod for AI structured output. |
| Lists | **@tanstack/react-virtual** | Smooth with 10,000+ jobs. |
| Drag and drop | **@dnd-kit** | Tracker Kanban board. |
| Charts | **Recharts** | Analytics. |
| PDF reading | **pdfjs-dist** | Bundle the worker locally (MV3 forbids remote code). |
| DOCX reading | **mammoth** | |
| PDF generation | **@react-pdf/renderer** | Resume templates as React components; embedded open-license fonts bundled locally. |
| HTML sanitizing | **DOMPurify** | For every piece of HTML from APIs or pages. |
| AI client | **openai** npm package with a custom `baseURL` per provider | Works with Gemini's OpenAI-compatible endpoint, Groq, OpenRouter, Ollama. Needs `dangerouslyAllowBrowser: true`; acceptable because each user's key stays on their own device. |
| Dates | **date-fns** | |
| IDs and hashes | `crypto.randomUUID()`, `crypto.subtle` SHA-256 | |
| Unit tests | **Vitest**, **@testing-library/react**, **fake-indexeddb** | |
| End-to-end tests | **Playwright** (Chromium with the extension loaded) | Against local fixtures only. |
| Lint/format | ESLint (typescript-eslint) + Prettier | |
| Crawler | **Go** (latest stable): `net/http`, `encoding/json`, `log/slog`, `golang.org/x/sync/errgroup`, `golang.org/x/sync/semaphore` | No web frameworks. Standard `testing` with golden files. |
| Website | **Vite + React** static site | Hosted on GitHub Pages together with the feed. |
| CI/CD | **GitHub Actions** | `ci.yml`, `crawl.yml`, `release.yml`. |
| License | MIT | |

Not used, on purpose: Express, MongoDB, any server, any paid API, Selenium, Puppeteer in production. Playwright is used only for tests.

---

## 5. Repository structure

Create this structure (adjust names only if a tool requires it, and log the change in `DECISIONS.md`):

```
job-copilot/
  package.json                 # root scripts: dev, build, test, lint, typecheck, e2e
  pnpm-workspace.yaml
  README.md  LICENSE  CONTRIBUTING.md
  docs/
    spec/part-1.md part-2.md part-3.md
    REQUIREMENTS.md PROGRESS.md DECISIONS.md
    ARCHITECTURE.md PERMISSIONS.md PUBLISHING.md QA.md
  shared/                      # TypeScript package used by extension and site
    src/
      config.ts                # APP_NAME, FEED_BASE_URL, AUTO_SUBMIT_HOSTS, limits
      schemas/                 # Zod schemas (section 6 and 8)
      skills/tagger.ts         # skill tagging (same algorithm as Go)
      parsing/experience.ts location.ts normalize.ts
      platforms/detect.ts      # careers URL -> { platform, token, jobId? }
    data/
      skills.json              # skill dictionary (shared with Go)
      locations.json           # countries, states, major cities (shared with Go)
    testcases/                 # golden cases run by BOTH Go and TS tests
      skills.cases.json experience.cases.json location.cases.json platform-urls.cases.json
  crawler/                     # Go module
    go.mod
    cmd/crawl/main.go          # subcommands: crawl, validate-companies, discover, stats
    internal/
      fetch/ (greenhouse, lever, ashby, smartrecruiters, workable)
      normalize/ skills/ parsing/ state/ feed/ httpx/
    companies.json             # seed list of companies
    testdata/                  # trimmed real API responses + golden outputs
  extension/
    wxt.config.ts
    entrypoints/
      background.ts
      dashboard/               # main app (index.html + React)
      sidepanel/
      popup/
      ats-greenhouse.content.ts ats-lever.content.ts ats-ashby.content.ts
      ats-workable.content.ts ats-smartrecruiters.content.ts
      assist-naukri.content.ts assist-indeed.content.ts
      assist-linkedin.content.ts assist-workday.content.ts
      badges-naukri.content.ts badges-indeed.content.ts badges-linkedin.content.ts
    lib/
      db/ messaging/ settings/ alarms/ feed/ sources/
      ai/ (client.ts scheduler.ts cache.ts redact.ts prompts/ tasks/)
      matcher/ resume/ (tailor.ts validate.ts templates/ render.ts)
      apply/ (adapters/ fields/ fill.ts guards.ts queue.ts answers.ts)
      github/ tracker/ analytics/ backup/ notifications/
    components/ui/
    assets/fonts/
    tests/ (unit/ e2e/ fixtures/)
  site/                        # Vite + React static website
  .github/workflows/ci.yml crawl.yml release.yml
```

---

## 6. Data model

Implement these as Zod schemas in `shared/src/schemas/` and infer TypeScript types from them. Field lists are the minimum; add fields if needed and log them in `DECISIONS.md`. Canonical skill IDs come from `skills.json`.

```ts
Profile {
  id: "me"
  version: number                       // increments on every edit; used to invalidate scores
  basics: {
    fullName, email, phone, phoneCountryCode?, city, state?, country (ISO-2),
    linkedinUrl?, githubUsername?, portfolioUrl?, otherLinks: { label, url }[]
  }
  headline?: string                     // e.g. "Full-stack developer (MERN, Go)"
  summary: string
  totalExperienceMonths: number         // computed from experience, user can override
  skills: {
    id (canonical), displayName, years?: number,
    level?: "beginner" | "intermediate" | "advanced" | "expert",
    source: "resume" | "github" | "user"
  }[]
  experience: {
    id, company, title, location?, employmentType?,
    startDate ("YYYY-MM"), endDate ("YYYY-MM" | null = current),
    bullets: string[], skills: string[]
  }[]
  education: { id, institution, degree, field?, startYear?, endYear?, grade? }[]
  projects: Project[]
  certifications: { id, name, issuer?, year?, url? }[]
  languages: { name, proficiency? }[]
  achievements: string[]
  baseResume?: { fileName, mimeType, fileId, extractedText, uploadedAt }
  updatedAt
}

Project {
  id, name,
  description: string                   // 1-3 sentences, confirmed by the user
  bullets: string[]                     // facts only, confirmed by the user
  techStack: string[]                   // canonical skill IDs
  links: { repo?, live? }
  source: "github" | "resume" | "manual"
  github?: {
    fullName, stars, forks, isFork, archived, languages: Record<string, number>,
    topics: string[], readmeExcerpt (max 2000 chars), pushedAt
  }
  included: boolean                     // user ticked "this is a real project"
  highlight: boolean                    // always include in tailored resumes
  updatedAt
}

Preferences {                           // "ask once" answers
  workAuthorization: { countryCode, status: "citizen" | "permanent_resident" | "work_visa" | "needs_sponsorship" | "other", note? }[]
  needsSponsorship: boolean
  noticePeriodDays: number
  noticeNegotiable: boolean
  servingNotice?: { lastWorkingDay? }
  currentCtc?: { amount, currency, period: "year" | "month" }
  expectedCtc?: { min, max?, currency, period: "year" | "month" }
  salaryDisclosure: "share" | "ask_each_time"
  preferredLocations: string[]
  remotePreference: "remote" | "hybrid" | "onsite" | "any"
  willingToRelocate: boolean
  earliestStartDate?: string
  desiredRoles: string[]                // e.g. "Frontend Developer", "Full Stack Developer", "Backend Developer (Go)"
  experienceLevel: "intern" | "junior" | "mid" | "senior" | "lead"
  jobTypes: ("full_time" | "contract" | "internship" | "part_time")[]
  countries: string[]                   // ISO-2 codes the user wants jobs in
  excludeTitleKeywords: string[]        // e.g. "sales", "manager"
  hiddenCompanies: string[]
  eeo?: { gender?, raceEthnicity?, hispanicLatino?, veteranStatus?, disabilityStatus?, pronouns? }  // all optional; default is "decline"
  dateOfBirth?: string                  // only if the user chooses to provide it
  howDidYouHearDefault?: string
}

AnswerBankEntry {
  id, question (original text), normalized (lowercase, punctuation stripped), fingerprint,
  answer: string | string[] | number | boolean,
  fieldType: "text" | "textarea" | "select" | "radio" | "checkbox" | "number" | "date",
  options?: string[], scope: "global" | `company:${string}`,
  source: "user" | "ai_approved", status: "active" | "pending_approval",
  sensitive: boolean, timesUsed, lastUsedAt?, createdAt
}

Job {
  id: string                            // `${platform}:${companyToken}:${externalId}` or `manual:${sha256}`
  platform: "greenhouse" | "lever" | "ashby" | "workable" | "smartrecruiters" | "naukri" | "indeed" | "linkedin" | "workday" | "adzuna" | "jsearch" | "other"
  source: "feed" | "personal_board" | "aggregator" | "saved_from_page" | "pasted"
  company: { name, token?, domain? }
  title, locations: string[], remote: "remote" | "hybrid" | "onsite" | "unknown", countryCodes: string[]
  url, applyUrl, externalApplyUrl?      // externalApplyUrl: "apply on company site" link found on a job board
  postedAt?, firstSeenAt, closedAt?
  skills: string[], experienceMin?, experienceMax?
  salary?: { min?, max?, currency, period: "year" | "month" | "hour" }
  employmentType?, department?, snippet (max 300 chars)
  description?: { html (sanitized), text, fetchedAt }   // fetched on demand
  mode: "auto" | "assist"               // derived from applyUrl/externalApplyUrl host
  dedupeKey: string                     // normalized company + title + primary location
  status: "new" | "saved" | "hidden" | "queued" | "applied" | "needs_you" | "closed"
}

JobScore {
  jobId, profileVersion,
  prefilter: { score (0-100), matchedSkills[], missingSkills[], passed: boolean, reasons[] }
  ai?: {
    score (0-100), verdict: "strong" | "good" | "weak" | "no",
    mustHave: { skill, met: boolean }[], niceToHave: { skill, met: boolean }[],
    experienceFit: "under" | "fit" | "over" | "unknown",
    locationFit: boolean | null, salaryFit: boolean | null,
    reasons: string[] (max 3, max 140 chars each), redFlags: string[]
  }
  final: number, isEstimate: boolean, scoredAt, model?
}

JdAnalysis { jobId, mustHave[], niceToHave[], keywords[], seniority, responsibilitiesSummary, domain?, createdAt, model }

Application {
  id, jobId, mode: "auto" | "assist",
  status: "queued" | "in_progress" | "needs_you" | "submitted" | "unconfirmed" | "failed" | "withdrawn",
  stage: "applied" | "screening" | "interview" | "offer" | "rejected" | "ghosted" | "accepted",
  resumeChoice: "current" | "tailored", resumeVersionId, coverLetterId?,
  answersSent: { question, answer, source: "profile" | "answer_bank" | "ai" | "user" }[],
  needsYouReason?: "captcha" | "verification_code" | "unknown_required_question" | "missing_sensitive_answer" | "validation_error" | "login_required" | "consent_required" | "approval_required" | "other",
  needsYouDetail?, submittedAt?, confirmationText?, notes: string, followUpAt?,
  events: { at, type, detail? }[]
}

ResumeVersion {
  id, kind: "base_uploaded" | "base_generated" | "tailored", jobId?, createdAt,
  document: ResumeDocument,             // structured content used to render the PDF
  fileId,                               // PDF blob in the files table
  pickedProjectIds: string[], keywordsTargeted: string[],
  validation: { passed: boolean, issues: string[] }, template: string, approvedByUser: boolean
}

CoverLetter { id, jobId, text, fileId?, createdAt, validation }
QueueItem { id, jobId, applicationId, state: "pending" | "preparing" | "running" | "waiting_pause" | "done" | "needs_you" | "failed", attempts, lastError?, scheduledFor, tabId? }
Company { id, name, platform, token, region?, addedAt, lastFetchedAt?, lastStatus?, enabled }
AiCacheEntry { key (sha256), task, promptVersion, model, value, createdAt, expiresAt? }
StoredFile { id, name, mimeType, blob, createdAt }
```

**Settings** (stored in `chrome.storage.sync`, except secrets):

```ts
Settings {
  ai: { provider: "gemini" | "groq" | "openrouter" | "ollama" | "custom", baseUrl, model,
        fallback?: { provider, baseUrl, model }, requestsPerMinute (default 10), dailyRequestBudget (default 300),
        dailyScoringBudget (default 150 jobs) }
  matching: { minPrefilterScore (default 40), showThreshold (default 60) }
  autoApply: { enabled (default false), explanationAccepted (default false), threshold (default 85),
               approvalMode: "always" | "below_threshold" (default "always"),
               pauseSeconds (default 90, min 30), dailyCap (default 20, max 50),
               perCompanyCap (default 2), perCompanyWindowDays (default 30),
               resumeDefault: "current" | "tailored" | "tailored_above_score" (default "current"),
               tailoredAboveScore (default 80), requireApprovalForFirstTailored (default 5),
               allowPrivacyAcknowledgement (default false), activeHours?: { start, end },
               dryRun (default false; true in development builds) }
  assist: { autofillEachStep (default true), badges: { naukri: true, indeed: true, linkedin: false } }
  tailoring: { projectsToPick (default 2, allowed 2-3), template (default "classic") }
  coverLetter: { mode: "off" | "ask" | "always" (default "ask") }
  sources: { feed: true, feedBaseUrl, personalBoards: true, adzuna: { enabled: false, country }, jsearch: { enabled: false } }
  notifications: { dailyDigest: true, digestHour: 9, needsYouAlerts: true, followUpDays: 7, ghostedAfterDays: 30 }
  privacy: { redactContactInfo: true }
  ui: { theme: "system" | "light" | "dark" }
}
```

Secrets (AI keys, GitHub token, Adzuna keys, JSearch key) live **only** in `chrome.storage.local`, never in sync, never in logs, never in exports unless the user explicitly ticks "include API keys".

**Storage mapping:**

- IndexedDB (Dexie) tables: `profile`, `projects`, `preferences`, `answerBank`, `jobs` (indexes: `status`, `platform`, `firstSeenAt`, `company.token`, `dedupeKey`, `mode`), `scores` (index `final`), `jdAnalyses`, `applications` (indexes: `jobId`, `stage`, `submittedAt`), `resumeVersions`, `coverLetters`, `files`, `queue`, `companies`, `aiCache`, `feedState`, `events`.
- `chrome.storage.sync`: settings, plus a compact mirror of the answer bank split into chunks that stays under the sync quota (about 100 KB total, about 8 KB per item). If it does not fit, keep the answer bank local only and show a notice suggesting export/import.
- `chrome.storage.local`: secrets and small runtime flags.
- Dexie schema versions with migrations; never lose user data on upgrade. Test migrations.

---

## 7. Go crawler

### 7.1 Overview

A single Go binary in `crawler/` with subcommands:

- `crawl` - fetch all companies, normalize, tag skills, diff against previous state, write the feed.
- `validate-companies [--fix]` - check every entry in `companies.json` (exists, returns jobs); print a summary table; `--fix` removes dead entries.
- `discover <careers-url>` - detect the job-board platform and token from a careers page URL or its HTML, and print a ready-to-paste `companies.json` entry.
- `stats` - print counts per platform, per country, top skills.

Module path: `github.com/<github-user>/job-copilot/crawler`. Keep the owner in one place and tell the user to replace it.

### 7.2 Input: `crawler/companies.json`

```json
[
  { "name": "Example Co", "platform": "greenhouse", "token": "exampleco", "region": ["IN", "REMOTE"], "tags": ["product"] }
]
```

Seed list: at least 150 real companies using Greenhouse, Lever, Ashby (and SmartRecruiters/Workable if verified), with a good share hiring in India or remote. **Verify every entry with `validate-companies` before committing.** Aim for at least 100 valid entries.

### 7.3 Platform fetchers

Interface:

```go
type Fetcher interface {
    Platform() string
    Fetch(ctx context.Context, c Company) ([]RawJob, error)
}
```

Endpoints (from memory; **verify against live responses**, then save trimmed fixtures in `crawler/testdata/`):

- **Greenhouse:** `GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true`. Response has `jobs[]` with `id`, `title`, `location.name`, `absolute_url`, `updated_at`, `content` (HTML that is entity-escaped: unescape, then process), `departments`, `offices`. Single job: `GET .../boards/{token}/jobs/{id}`. Hosted apply URL: `https://job-boards.greenhouse.io/{token}/jobs/{id}` (verify; fall back to `boards.greenhouse.io`). Many companies embed Greenhouse in their own careers page; always use the Greenhouse-hosted URL as `applyUrl`.
- **Lever:** `GET https://api.lever.co/v0/postings/{token}?mode=json` (EU accounts: `api.eu.lever.co`). Items have `id`, `text` (title), `categories` (`location`, `team`, `commitment`, `allLocations`), `workplaceType`, `hostedUrl`, `applyUrl`, `createdAt` (ms), `descriptionPlain`, `lists[]`, `additionalPlain`, maybe `salaryRange`. Single posting: `GET .../postings/{token}/{id}`.
- **Ashby:** `GET https://api.ashbyhq.com/posting-api/job-board/{token}?includeCompensation=true`. Response has `jobs[]` with `id`, `title`, `location`, `secondaryLocations`, `department`, `team`, `isRemote`, `workplaceType`, `employmentType`, `descriptionHtml`, `descriptionPlain`, `publishedAt`, `jobUrl`, `applyUrl`, `compensation`.
- **SmartRecruiters:** `GET https://api.smartrecruiters.com/v1/companies/{token}/postings?limit=100&offset=N` (paginate). Details per posting: `GET .../postings/{id}`. Fetch details only for jobs not seen before, with rate limiting.
- **Workable:** find and verify a current public endpoint (for example the widget API `https://apply.workable.com/api/v1/widget/accounts/{token}`). If no stable public endpoint can be confirmed, do not include Workable in the crawler; document that and keep Workable supported in the extension for jobs users save or add.

### 7.4 Normalization

Normalize every raw job into `FeedJob` (section 8) with:

- **Skills:** tag from title + description using `shared/data/skills.json` (7.5).
- **Experience:** parse ranges like "3+ years", "2-5 years", "minimum 4 yrs", "5 to 8 years", "at least 2 years of experience". Prefer numbers near words like "experience". Take the smallest minimum and largest maximum found. Shared golden cases.
- **Location and country:** parse using `shared/data/locations.json` (countries, US states, Indian states, major cities with aliases such as Bengaluru/Bangalore, Gurugram/Gurgaon, Mumbai/Bombay; UK, EU, Canada, Australia, Singapore, UAE major cities). Shared golden cases.
- **Remote:** from `workplaceType`/`isRemote` fields first, then "remote" in location or title.
- **Salary:** only when the API provides it.
- **Snippet:** first 300 characters of plain-text description, whitespace collapsed.
- **descHash:** SHA-256 of the plain-text description, to detect changes.

### 7.5 Skill dictionary and tagger (shared by Go and TypeScript)

`shared/data/skills.json`: at least 300 software skills, each with `id`, `display`, `aliases[]`, `category` (language, frontend, backend, database, cloud, devops, testing, mobile, data, ml, tool, practice), and optional `ambiguous: true` with `contextPatterns[]`.

Tagger rules:

- Case-insensitive, whole-word alias matching that handles punctuation (`node.js`, `c#`, `c++`, `.net`, `next.js`, `ci/cd`).
- Distinguish `java` from `javascript`, `react` from `react native`, `node` from `node.js` (same skill), `sql` from specific databases.
- Ambiguous short names (`go`, `r`, `c`, `rust` is fine, `swift` is fine, `spring`, `express`): match only via unambiguous aliases (`golang`) or a context pattern (for example "Go developer", "in Go", "Go/", "Golang"). Never tag "go" from ordinary English ("go-to-market", "on the go").
- Output: sorted, de-duplicated canonical IDs.
- `shared/testcases/skills.cases.json`: at least 120 cases (input text and expected IDs), run by both the Go tests and the Vitest tests. Both implementations must produce identical output.

### 7.6 HTTP behavior

- `User-Agent: JobCopilotCrawler/1.0 (+https://github.com/<github-user>/job-copilot)`.
- Global concurrency limit 8, per-host limit 2, timeout 20 s per request.
- Up to 3 retries with exponential backoff plus jitter for 5xx, timeouts, and 429; honor `Retry-After`.
- Do not retry 404 (company moved; report it in the run summary).
- Structured logs with `log/slog`. Exit non-zero only if more than 50% of companies fail, so a few broken entries never break the scheduled workflow.

### 7.7 State and diff

- State file: `data/state/seen.json`: map of job ID to `{ firstSeenAt, lastSeenAt, descHash, companyKey }`.
- **New job:** not in state.
- **Closed job:** in state, not returned this run, **and** that company's fetch succeeded. Never mark jobs closed when a company's fetch failed.
- **Changed job:** `descHash` differs; update it in the snapshot (no need to resend in a delta).
- Remove closed jobs from state after 30 days.

### 7.8 Output (written to `data/feed/`)

- `snapshot.json` - all currently open jobs, compact (no whitespace). New users download this once on install.
- `jobs/YYYY-MM-DD.json` - `{ date, jobs: FeedJob[] }`: jobs first seen that UTC day. Several runs per day merge into the same file.
- `closed/YYYY-MM-DD.json` - `{ date, ids: string[] }`.
- `companies.json` - public list with job counts, `lastOkAt`, `lastStatus` (used by the website status page and the extension's company list).
- `index.json`:

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-11-02T06:00:00Z",
  "totalOpenJobs": 5234,
  "companyCount": 142,
  "skillsVersion": "2026-11-01",
  "snapshot": { "file": "snapshot.json", "sha256": "...", "count": 5234 },
  "shards": [ { "date": "2026-11-02", "file": "jobs/2026-11-02.json", "count": 87, "sha256": "..." } ],
  "closedShards": [ { "date": "2026-11-02", "file": "closed/2026-11-02.json", "count": 12 } ]
}
```

- Keep 30 days of daily shards and closed files; delete older ones and list only retained files in `index.json`.
- Log a warning if `snapshot.json` is larger than 15 MB.
- Full descriptions are **not** in the feed. The extension fetches them on demand from the ATS single-job endpoints (Ashby: fetch the board and pick the job; cache the board response for 1 hour).

### 7.9 `discover` and URL detection

Detect platform and token from URLs or HTML markers, for example:

- `boards.greenhouse.io/{token}`, `job-boards.greenhouse.io/{token}`, `boards.greenhouse.io/embed/job_board?for={token}`, `gh_jid=` query parameters
- `jobs.lever.co/{token}`, `jobs.eu.lever.co/{token}`
- `jobs.ashbyhq.com/{token}`
- `jobs.smartrecruiters.com/{token}`, `careers.smartrecruiters.com/{token}`
- `apply.workable.com/{token}`

Patterns live in `shared/testcases/platform-urls.cases.json` and are used by both the Go `discover` command and the TypeScript `detect.ts` (used by the extension's "Add company" feature). At least 40 cases.

### 7.10 Crawler tests

- Parser tests per platform against saved fixtures.
- Tagger, experience, and location tests against the shared golden cases.
- Diff tests: new, closed, changed, and "fetch failed, so nothing is closed".
- Golden output test: run the feed writer on fixtures, compare to `testdata/golden/`. A TypeScript test in `shared` parses the golden output with the Zod `FeedJob`/`FeedIndex` schemas, guaranteeing both sides agree.
- `go vet`, and run concurrency tests with `-race`.
- Live contract tests (real GET requests only) behind a build tag: `go test -tags=live ./...`. Not run in normal CI.

---

## 8. Feed contract (shared between Go and TypeScript)

Define in Zod (`shared/src/schemas/feed.ts`) and mirror exactly in Go structs with matching JSON tags:

```ts
FeedJob {
  id: string                       // `${platform}:${companyToken}:${externalId}`
  platform: "greenhouse" | "lever" | "ashby" | "smartrecruiters" | "workable"
  company: { name: string, token: string }
  title: string
  locations: string[]
  remote: "remote" | "hybrid" | "onsite" | "unknown"
  countryCodes: string[]           // ISO-2
  url: string                      // public job page
  applyUrl: string                 // hosted application form URL (must be on an AUTO_SUBMIT_HOSTS host)
  postedAt?: string                // ISO-8601
  firstSeenAt: string
  skills: string[]                 // canonical IDs
  expMin?: number
  expMax?: number
  salary?: { min?: number, max?: number, currency: string, period: "year" | "month" | "hour" }
  employmentType?: string
  department?: string
  snippet: string                  // max 300 chars
  descHash: string
}

FeedIndex { schemaVersion: 1, generatedAt, totalOpenJobs, companyCount, skillsVersion,
            snapshot: { file, sha256, count },
            shards: { date, file, count, sha256 }[],
            closedShards: { date, file, count }[] }
```

Any change to this contract must bump `schemaVersion`, and the extension must handle unknown future versions gracefully (show "Update the extension to keep receiving jobs").

---

END OF PART 1 of 3.

(If this was pasted: save it to `docs/spec/part-1.md` and reply only "Part 1 of 3 saved - send Part 2.")
