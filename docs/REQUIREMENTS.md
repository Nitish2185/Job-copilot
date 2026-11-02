# Requirements checklist

One line per requirement from the spec (`docs/spec/part-1.md`, `part-2.md`, `part-3.md`), grouped by section.
Tick an item when it is implemented. Testable rules name the test that covers them.
Anything not done at the end moves to **Deferred** with a reason.

## 0. Working rules

- [x] 0.1 All three spec parts saved verbatim in `docs/spec/`
- [x] 0.2 `docs/REQUIREMENTS.md` created before writing code
- [ ] 0.3 `docs/PROGRESS.md` kept current (phase, done, next, known issues)
- [ ] 0.4 `docs/DECISIONS.md` records every open choice with a one-line reason
- [ ] 0.5 Work in phases; run checks and update docs at the end of each phase (commit per feature, push to `main` - see DECISIONS)
- [ ] 0.6 Library versions checked against current docs and pinned exactly in `package.json` and `go.mod`
- [ ] 0.6 Real GET request made for every external API before writing its parser; trimmed response saved as a fixture
- [ ] 0.7 No real job application submitted during development; form fillers tested only on local fixtures
- [ ] 0.8 TypeScript `strict`, no `any` except at validated boundaries, ESLint + Prettier clean
- [ ] 0.9 Cross-platform scripts only (Node scripts or `cross-env`, no bash-only npm scripts)
- [x] 0.9 Prerequisites checked in Phase 0 (Node 22+, pnpm, Go latest stable, Git)

## 1. What we are building

- [x] 1 App name lives in one constant (`APP_NAME`) so it is easy to rename
- [ ] 1.1 Finds jobs from the shared feed (Greenhouse, Lever, Ashby, SmartRecruiters, Workable if verified)
- [ ] 1.1 Finds jobs from the user's own company list (fetched directly by the extension)
- [ ] 1.1 Finds jobs from optional listing APIs with the user's own keys (Adzuna, JSearch)
- [ ] 1.1 Saves jobs from any page the user is viewing
- [ ] 1.1 Accepts manually pasted job descriptions
- [ ] 1.1 Ranks jobs: local keyword prefilter, then AI score with reasons, must-have checklist, missing skills
- [ ] 1.1 Prepares applications from profile + answer bank; optional tailored resume (2 most relevant real projects) and cover letter
- [ ] 1.1 Auto mode on Greenhouse, Lever, Ashby, Workable, SmartRecruiters (background tab, after approval or above threshold)
- [ ] 1.1 Assist mode everywhere else (fills, the user submits)
- [ ] 1.1 Tracks every application with exact resume and answers sent, follow-ups, stages, analytics (incl. tailored vs current response rate)
- [ ] 1.2 No backend server, no hosted database, no paid services
- [ ] 1.2 Shared feed is static JSON on GitHub Pages built by a scheduled workflow
- [ ] 1.2 BYOK: Gemini default; Groq, OpenRouter, Ollama, any OpenAI-compatible endpoint; keys stay on device
- [ ] 1.2 All user data local (IndexedDB + `chrome.storage`); only AI requests and applications leave the device
- [ ] 1.2 Works without an AI key (keyword matching, profile autofill, tracking, base resume); AI features show "Add an AI key to enable this"
- [ ] 1.2 First-class India support (Naukri, Indeed India, CTC in LPA, notice period) while working globally

## 2. Non-negotiable rules

### 2.1 Assist-only sites never submit

- [ ] 2.1 Assist list covers Naukri, Indeed, LinkedIn, Wellfound, Glassdoor, Foundit, Instahyre, Hirist, Cutshort, Workday, iCIMS, Taleo/Oracle, SuccessFactors, and every non-allowlisted site
- [ ] 2.1 Fill only on a page the user opened, only on Autofill button/shortcut or "Autofill each new step automatically" (default ON)
- [ ] 2.1 Auto-step setting fills only the visible tab; never clicks or navigates
- [ ] 2.1 Allowed interactions limited to setting control values, opening comboboxes, attaching files, "Add another" section buttons
- [ ] 2.1 `isNavigationOrSubmitControl(element)` guard implemented
- [ ] 2.1 Every programmatic click goes through one `safeClick()` that refuses forbidden elements on Assist sites
- [ ] 2.1 Guard unit-tested with many real button labels and structures
- [ ] 2.1 Never opens the next job, never loops through results, never works in background tabs on Assist sites
- [ ] 2.1 No network requests to Assist sites (no scraping, hidden fetches, internal APIs); DOM of loaded pages only
- [ ] 2.1 Search-page badges computed only from what the page already loaded

### 2.2 Auto allowlist

- [x] 2.2 `AUTO_SUBMIT_HOSTS` is one constant in `shared`
- [ ] 2.2 Single submit function asserts exact hostname match right before clicking and throws otherwise (unit-tested)
- [ ] 2.2 Test builds may add a local fixture host via a build-time flag; a test asserts production builds exclude it
- [ ] 2.2 Allowlist hosts verified during development (changes logged in DECISIONS)

### 2.3 Never

- [ ] 2.3 Never ask for, store, or type job-site passwords; never log in for the user
- [ ] 2.3 Detect logged-out state and show a "please log in" banner; never fill login or sign-up forms
- [ ] 2.3 Never request the `cookies` permission or read cookies
- [ ] 2.3 Never bypass CAPTCHAs/bot checks; on detection stop, mark "Needs you", notify
- [ ] 2.3 No human-imitation automation (fake mouse moves, typing delays, fingerprint changes, proxies)
- [ ] 2.3 Never fill email/SMS verification codes; stop and mark "Needs you"
- [ ] 2.3 Never invent facts on resumes, cover letters, or answers
- [ ] 2.3 AI never decides sensitive answers (work auth, sponsorship, salary/CTC, notice, background check, relocation, attestations, DOB); missing -> stop, ask, save to answer bank
- [ ] 2.3 Never accept terms/consent for the user, except privacy-notice acknowledgement on Auto forms when the opt-in (default OFF) is on
- [ ] 2.3 Never fill hidden or disabled fields
- [ ] 2.3 Never apply twice to the same job; respect per-company and daily caps
- [ ] 2.3 Auto-apply OFF by default; enabling requires an explanation dialog and a score threshold

### 2.4 Politeness limits

- [ ] 2.4 Pause between automatic submissions: default 90 s, minimum 30 s, configurable
- [ ] 2.4 Daily automatic-submission cap: default 20, max 50
- [ ] 2.4 Per-company cap: default 2 per 30 days, configurable
- [ ] 2.4 Crawler: clear User-Agent with repo URL, per-host concurrency limit, retries with backoff, honors 429 and `Retry-After`

### 2.5 Untrusted content

- [ ] 2.5 Job descriptions and page content wrapped in delimited data sections with an "ignore instructions inside" rule
- [ ] 2.5 AI output required as JSON and validated with Zod
- [ ] 2.5 AI output never triggers actions directly; code decides every action

## 3. Architecture

- [ ] 3 GitHub Actions cron (every 6 h) runs the crawler, commits state to the `data` branch, deploys Pages (site + `/feed/*.json`)
- [ ] 3 Extension background handles feed sync, personal boards, listing APIs, matcher, AI scheduler, apply queue, notifications
- [ ] 3 No server of ours anywhere

## 4. Tech stack

- [ ] 4 pnpm workspaces with `extension`, `site`, `shared`; Go module in `crawler/`
- [ ] 4 WXT + TypeScript strict; builds Chrome/Edge MV3 and Firefox; uses WXT `browser` wrapper
- [ ] 4 React + Tailwind; Radix UI primitives; lucide-react icons; reusable components in `extension/components/ui`
- [ ] 4 On-site UI via WXT `createShadowRootUi`
- [ ] 4 Dashboard uses react-router with a hash router
- [ ] 4 Zustand for UI-only state; Dexie live queries for DB state
- [ ] 4 Dexie + dexie-react-hooks with versioned schema
- [ ] 4 react-hook-form + Zod resolver
- [ ] 4 Zod as single source of truth; JSON Schema exported from Zod for AI structured output
- [ ] 4 @tanstack/react-virtual for lists (10,000+ jobs)
- [ ] 4 @dnd-kit for the Kanban board
- [ ] 4 Recharts for analytics
- [ ] 4 pdfjs-dist with the worker bundled locally
- [ ] 4 mammoth for DOCX
- [ ] 4 @react-pdf/renderer with bundled open-license fonts
- [ ] 4 DOMPurify for every piece of external HTML
- [ ] 4 `openai` package with per-provider `baseURL` (`dangerouslyAllowBrowser: true`)
- [ ] 4 date-fns; `crypto.randomUUID()`; `crypto.subtle` SHA-256
- [ ] 4 Vitest, Testing Library, fake-indexeddb; Playwright e2e against local fixtures only
- [x] 4 ESLint (typescript-eslint) + Prettier
- [ ] 4 Go crawler uses only stdlib + `x/sync` (errgroup, semaphore); no web frameworks
- [ ] 4 Site: Vite + React on GitHub Pages
- [ ] 4 CI/CD workflows: `ci.yml`, `crawl.yml`, `release.yml`
- [x] 4 MIT license
- [ ] 4 No Express, MongoDB, servers, paid APIs, Selenium, or production Puppeteer

## 5. Repository structure

- [ ] 5 Repository layout follows section 5 (deviations logged in DECISIONS)
- [ ] 5 Root scripts: dev, build, test, lint, typecheck, e2e
- [ ] 5 Docs: README, LICENSE, CONTRIBUTING, ARCHITECTURE, PERMISSIONS, PUBLISHING, QA

## 6. Data model

- [x] 6 Zod schemas in `shared/src/schemas/` with inferred types: Profile, Project, Preferences, AnswerBankEntry, Job, JobScore, JdAnalysis, Application, ResumeVersion, CoverLetter, QueueItem, Company, AiCacheEntry, StoredFile
- [ ] 6 `Profile.version` increments on every edit
- [x] 6 Settings schema with all defaults from section 6
- [ ] 6 Secrets (AI keys, GitHub token, Adzuna, JSearch) only in `chrome.storage.local`; never synced, logged, or exported unless "include API keys" is ticked
- [ ] 6 Dexie tables and indexes as listed (jobs: status, platform, firstSeenAt, company.token, dedupeKey, mode; scores: final; applications: jobId, stage, submittedAt)
- [ ] 6 Settings in `chrome.storage.sync`; answer bank mirror chunked under quota (~100 KB total, ~8 KB/item), else local-only with an export/import notice
- [ ] 6 Dexie schema versions with migrations that never lose data; migrations tested

## 7. Go crawler

### 7.1 Overview

- [ ] 7.1 `crawl` subcommand
- [ ] 7.1 `validate-companies [--fix]` subcommand with summary table
- [ ] 7.1 `discover <careers-url>` subcommand prints a ready-to-paste entry
- [ ] 7.1 `stats` subcommand (per platform, per country, top skills)
- [ ] 7.1 Module path owner kept in one place (set-owner script)

### 7.2 Companies

- [ ] 7.2 `crawler/companies.json` seed list: 150+ candidates, good share India/remote
- [ ] 7.2 Every entry verified with `validate-companies`; 100+ valid entries

### 7.3 Fetchers

- [ ] 7.3 `Fetcher` interface (`Platform()`, `Fetch(ctx, Company)`)
- [ ] 7.3 Greenhouse fetcher (verified endpoint, unescaped HTML content, hosted `applyUrl`)
- [ ] 7.3 Lever fetcher (global + EU)
- [ ] 7.3 Ashby fetcher (with compensation)
- [ ] 7.3 SmartRecruiters fetcher (paginated; details only for new jobs, rate-limited)
- [ ] 7.3 Workable fetcher if a stable public endpoint is verified, otherwise documented exclusion
- [ ] 7.3 Trimmed real responses saved as fixtures in `crawler/testdata/`

### 7.4 Normalization

- [ ] 7.4 Skills tagged from title + description
- [ ] 7.4 Experience range parser (smallest min, largest max, prefers numbers near "experience")
- [ ] 7.4 Location and country parser using `locations.json` (aliases like Bengaluru/Bangalore)
- [ ] 7.4 Remote from API fields first, then "remote" in location/title
- [ ] 7.4 Salary only when the API provides it
- [ ] 7.4 Snippet: first 300 chars of plain text, whitespace collapsed
- [ ] 7.4 `descHash`: SHA-256 of plain-text description

### 7.5 Skills

- [x] 7.5 `shared/data/skills.json` with 300+ skills (id, display, aliases, category, optional ambiguous + contextPatterns)
- [ ] 7.5 Tagger: case-insensitive whole-word matching with punctuation (`node.js`, `c#`, `c++`, `.net`, `next.js`, `ci/cd`)
- [ ] 7.5 Tagger distinguishes java/javascript, react/react native, sql/specific databases; node = node.js
- [ ] 7.5 Ambiguous names (go, r, c, spring, express) only via unambiguous aliases or context patterns; never from ordinary English
- [ ] 7.5 Output sorted, de-duplicated canonical IDs
- [ ] 7.5 `skills.cases.json` with 120+ cases run by Go and Vitest with identical output

### 7.6 HTTP

- [ ] 7.6 User-Agent `JobCopilotCrawler/1.0 (+repo URL)`
- [ ] 7.6 Global concurrency 8, per-host 2, 20 s timeout
- [ ] 7.6 Up to 3 retries with exponential backoff + jitter for 5xx, timeouts, 429; honors `Retry-After`
- [ ] 7.6 No retry on 404; reported in run summary
- [ ] 7.6 Structured `slog` logs; exit non-zero only if more than 50% of companies fail

### 7.7 State and diff

- [ ] 7.7 State file `data/state/seen.json` (firstSeenAt, lastSeenAt, descHash, companyKey)
- [ ] 7.7 New = not in state; closed = missing and company fetch succeeded; never close on failed fetch
- [ ] 7.7 Changed descHash updates the snapshot
- [ ] 7.7 Closed jobs removed from state after 30 days

### 7.8 Output

- [ ] 7.8 `snapshot.json` compact, all open jobs
- [ ] 7.8 `jobs/YYYY-MM-DD.json` daily shards; multiple runs per day merge
- [ ] 7.8 `closed/YYYY-MM-DD.json`
- [ ] 7.8 Public `companies.json` with job counts, `lastOkAt`, `lastStatus`
- [ ] 7.8 `index.json` with schemaVersion, counts, snapshot hash, shard and closed-shard lists
- [ ] 7.8 30-day retention for shards; index lists only retained files
- [ ] 7.8 Warning when `snapshot.json` exceeds 15 MB
- [ ] 7.8 Full descriptions not in the feed; fetched on demand (Ashby board cached 1 h)

### 7.9 Discover

- [ ] 7.9 Platform/token detection from URLs and HTML markers (Greenhouse incl. embed + `gh_jid`, Lever + EU, Ashby, SmartRecruiters, Workable)
- [ ] 7.9 `platform-urls.cases.json` with 40+ cases used by Go `discover` and TS `detect.ts`

### 7.10 Crawler tests

- [ ] 7.10 Parser tests per platform against fixtures
- [ ] 7.10 Tagger, experience, location tests against shared golden cases
- [ ] 7.10 Diff tests: new, closed, changed, failed fetch closes nothing
- [ ] 7.10 Golden feed output test in Go + Zod parse of the golden output in `shared`
- [ ] 7.10 `go vet` and `-race`
- [ ] 7.10 Live contract tests behind `-tags=live` (not in normal CI)

## 8. Feed contract

- [x] 8 `FeedJob` and `FeedIndex` Zod schemas in `shared/src/schemas/feed.ts`
- [ ] 8 Go structs mirror the schema with matching JSON tags
- [x] 8 `applyUrl` must be on an `AUTO_SUBMIT_HOSTS` host
- [ ] 8 Contract changes bump `schemaVersion`; extension shows "Update the extension to keep receiving jobs" for unknown versions

## 9. Extension structure

### 9.1 Entrypoints

- [ ] 9.1 Background service worker (alarms, sync, AI scheduler, matcher, queue, notifications, menus, commands, routing)
- [ ] 9.1 Dashboard full tab with `#/onboarding` opened on first install
- [ ] 9.1 Side panel on Chrome/Edge; Firefox sidebar via per-browser config
- [ ] 9.1 Popup
- [ ] 9.1 Auto adapter content scripts (greenhouse, lever, ashby, workable, smartrecruiters)
- [ ] 9.1 Assist content scripts (naukri, indeed; linkedin and workday under optional permission)
- [ ] 9.1 Badge content scripts (naukri, indeed; linkedin optional)
- [ ] 9.1 Generic assist and "save this job" injected on demand via `scripting` + `activeTab`

### 9.2 Permissions

- [ ] 9.2 `docs/PERMISSIONS.md` justifies every permission
- [ ] 9.2 Permissions: storage, unlimitedStorage, alarms, notifications, scripting, activeTab, contextMenus, sidePanel (Chrome/Edge); `tabs` only with a logged reason
- [ ] 9.2 Required hosts: Auto hosts, ATS API hosts, feed origin, api.github.com, Gemini API, Naukri, Indeed
- [ ] 9.2 Optional hosts requested at runtime with explanation: LinkedIn, Workday, other AI providers, Ollama, custom URL, Adzuna, JSearch
- [ ] 9.2 Never cookies, blocking webRequest, debugger, history, management, or required `<all_urls>`

### 9.3 Commands and menus

- [ ] 9.3 Commands `autofill` (Alt+Shift+F) and `toggle-side-panel` (Alt+Shift+J); current shortcut shown in UI
- [ ] 9.3 Context menu: "Save this job to Job Copilot", "Score this job", "Autofill this form"

### 9.4 Service worker lifecycle

- [ ] 9.4 No important state only in memory; queue and progress persisted in IndexedDB
- [ ] 9.4 Alarms: feed-sync (6 h + startup), boards-sync (6 h), queue-tick (1 min while work), daily-digest, followups, github-refresh (weekly), cleanup (daily)
- [ ] 9.4 Long tasks resumable via stored cursors

### 9.5 Messaging

- [ ] 9.5 Typed message bus: discriminated union with Zod payload/response schemas
- [ ] 9.5 Background validates every message and checks `sender.tab.url` against the message type
- [ ] 9.5 UI and content scripts reach AI and shared data only through background

### 9.6 Cross-browser

- [ ] 9.6 Chrome MV3, Edge (same build), Firefox per WXT recommendation
- [ ] 9.6 Side panel/sidebar differences handled in one place
- [ ] 9.6 Firefox build tested manually in Phase 11; unsupported items documented
- [ ] 9.6 No remote code, no `eval`; pdf.js worker and fonts bundled

## 10. Onboarding and profile

- [ ] 10 First install opens `dashboard.html#/onboarding`; steps revisitable; progress saved after every step
- [ ] 10.S1 Welcome and privacy explanation (data local, what goes to AI, what goes to employers, Auto vs Assist, auto-apply off)
- [ ] 10.S2 AI setup: provider choice, key link + steps, Test button, model list from `/models` with text fallback, default Flash-class model in config, optional fallback provider, Skip
- [ ] 10.S3 Resume upload PDF/DOCX up to 5 MB stored as base resume
- [ ] 10.S3 Text extraction (pdfjs, mammoth); scanned-resume warning under 200 chars
- [ ] 10.S3 Local regex extraction of contact details before any AI call
- [ ] 10.S3 `extractProfile` with AI on redacted text; manual side-by-side editor without AI
- [ ] 10.S3 Full editable profile form; uncertain AI fields highlighted; user confirms
- [ ] 10.S3 `totalExperienceMonths` computed (overridable); skill years suggested from experience
- [ ] 10.S4 GitHub import: repo list with rate-limit display; languages/README only for ticked repos; cache; weekly refresh; optional no-scope token in local storage
- [ ] 10.S4 Forks and archived repos unticked by default
- [ ] 10.S4 `describeProject` with AI (user approves); prefill from repo data without AI
- [ ] 10.S4 Merge with resume projects instead of duplicating
- [ ] 10.S4 Per-project toggles: "Real project" and "Always include in tailored resumes"
- [ ] 10.S5 Manual projects not on GitHub
- [ ] 10.S6 Preferences form covering every Preferences field with one-line usage notes
- [ ] 10.S6 India helpers: INR default for IN; CTC parser for "12 LPA", "12.5 lakh", "1200000"; display as "12 LPA"; unit-tested
- [ ] 10.S7 Job preferences (roles, level, job types, countries, locations, remote, min salary, excluded keywords, hidden companies)
- [ ] 10.S8 Modes step: Auto vs Assist table; auto-apply stays off; resume default choice
- [ ] 10.S9 Done step starts first feed sync and scoring with progress, then opens Matches
- [ ] 10.1 Profile page edits everything; every save increments version
- [ ] 10.1 Profile change recomputes prefilter scores; offers "Re-score top 50 with AI"

## 11. AI layer

- [ ] 11.1 Provider client with base URLs for Gemini, Groq, OpenRouter, Ollama, custom (verified)
- [ ] 11.1 Chat completions with JSON Schema `response_format` when supported, else JSON object + schema in prompt
- [ ] 11.2 `runTask` with id, promptVersion, prompt builder, Zod schema, cache TTL, sensitive-input flag
- [ ] 11.2 Flow: build -> cache -> schedule -> parse -> validate -> one repair retry -> `AiValidationError`
- [ ] 11.2 All AI calls through background
- [ ] 11.3 Token-bucket rate limiter per provider (default 10 rpm)
- [ ] 11.3 Daily budget: warning at 80%, pause at 100% until local midnight with message
- [ ] 11.3 On 429: honor retry delay, exponential backoff, switch to fallback provider
- [ ] 11.3 Priority queue: user-initiated before background tasks
- [ ] 11.3 Settings shows requests today, cache hits, errors, provider status
- [ ] 11.4 Cache key SHA-256(taskId + promptVersion + model + canonical JSON input)
- [ ] 11.4 TTLs: profile/project never; JD analysis 30 d; scoring 30 d; answers 90 d
- [ ] 11.5 Redaction of email, phone, address, DOB, full name before sending (default on)
- [ ] 11.5 Contact fields extracted locally and never sent; PDFs rendered locally
- [ ] 11.5 Redactor unit-tested with Indian +91, international, plus-sign emails
- [ ] 11.6 Untrusted-content system message for every web-content task
- [ ] 11.6 Instruction-like text in JDs adds a red flag and never raises the score
- [ ] 11.6 AI output is data only
- [ ] 11.7 Versioned prompt files in `lib/ai/prompts/` with Zod output schemas
- [ ] 11.7 Task `extractProfile`
- [ ] 11.7 Task `describeProject`
- [ ] 11.7 Task `scoreJobs` (batches of 10; unknown IDs ignored)
- [ ] 11.7 Task `analyzeJd` (cached per job)
- [ ] 11.7 Task `pickProjects` (IDs verified by code)
- [ ] 11.7 Task `tailorResume` (structured changes only)
- [ ] 11.7 Task `writeCoverLetter` (150-250 words)
- [ ] 11.7 Task `answerQuestion` (blocked for sensitive categories before calling)
- [ ] 11.7 Task `extractJobFromPage`
- [ ] 11.7 Task `interviewPrep` (Phase 11 stretch)
- [ ] 11.8 Token budgets: JD 6000/1500 chars, README 2000, project descriptions 400, whitespace stripped, never full HTML

## 12. Matching

- [ ] 12.1 Hard filters: countries/locations + remote, job types, closed, hidden companies, excluded title keywords
- [ ] 12.1 Prefilter formula (skillCoverage over first 12 skills, titleMatch, experienceFit) with named weights
- [ ] 12.1 Title skills count double in skillCoverage
- [ ] 12.1 Matched/missing skills and short reasons stored
- [ ] 12.1 Formula unit-tested with fixtures
- [ ] 12.2 AI scoring only for passed jobs, newest first, batches of 10, within `dailyScoringBudget`
- [ ] 12.2 `final` = AI score or prefilter with `isEstimate` ("estimate" shown)
- [ ] 12.2 Matches shows `final >= showThreshold` by default with "show all"
- [ ] 12.3 "Learn next" skill gaps from top 100 jobs with unlock counts
- [ ] 12.4 New jobs prefiltered immediately, AI-scored in background within budget
- [ ] 12.4 Profile change re-runs prefilter; AI re-score on request

## 13. Job sources

- [ ] 13.1 Install: download index + snapshot (sha256 verified), upsert
- [ ] 13.1 Every 6 h: index with `If-None-Match`; only new shards and closed files
- [ ] 13.1 Re-download snapshot when offline longer than retained shards
- [ ] 13.1 `FEED_BASE_URL` in config, overridable in Settings
- [ ] 13.1 Unknown `schemaVersion` stops sync with update message
- [ ] 13.2 "Add company" by URL via shared `detect.ts`; clear message when unsupported
- [ ] 13.2 Personal boards fetched every 6 h with a TS port of the normalizer (same golden cases)
- [ ] 13.2 "Suggest for the shared list" opens a pre-filled GitHub issue URL
- [ ] 13.3 Adzuna (verified endpoint) and JSearch (verified endpoint), off by default, with daily call limits
- [ ] 13.3 Listing results normalized into Job; mode from apply URL host
- [ ] 13.4 Save from page: JSON-LD `JobPosting`, then adapter `readJob()`, then AI `extractJobFromPage` or prefilled form
- [ ] 13.4 "Apply on company site" link stored as `externalApplyUrl`; Auto-eligible when its host is allowlisted
- [ ] 13.5 "Add job manually" (paste description + optional URL, company, title)
- [ ] 13.6 Search links for Naukri, Indeed (country subdomain), LinkedIn opened only on click (formats verified)
- [ ] 13.7 Badges read cards already on the page; local prefilter only
- [ ] 13.7 Optional "AI-score the jobs on this page" (max 10 per click) via scheduler
- [ ] 13.7 Shadow DOM badge with score, color, top skills, Save button
- [ ] 13.7 `MutationObserver` for new cards; never fetches pages or clicks
- [ ] 13.8 `dedupeKey` = normalized company | title | primary location
- [ ] 13.8 Merge keeps earliest firstSeenAt, all URLs, prefers Auto-eligible apply URL
- [ ] 13.8 "Also listed on ..." shown on merged jobs

## 14. Resume

- [ ] 14.1 Two choices everywhere: "Apply with my resume" / "Apply with a resume made for this job"; default from `resumeDefault`
- [ ] 14.2 Tailoring pipeline: analyze, pick, tailor, validate, render, preview, save
- [ ] 14.2 `pickProjects` honors N (2-3), highlight projects count toward N, IDs validated
- [ ] 14.2 Deterministic project-pick fallback (techStack overlap, then recency)
- [ ] 14.2 Preview with "What changed", edit text, swap project, regenerate
- [ ] 14.2 `ResumeVersion` stored and linked to the application
- [ ] 14.3 `TailorOutput` structured schema; companies, titles, dates, education, certs, contacts copied from profile
- [ ] 14.4 Validator: no new skills (tagger), no new numbers, no new employers/products/certs (best effort)
- [ ] 14.4 Validator limits: summary 60 words, bullets 30 words, no more bullets than original
- [ ] 14.4 Violations replaced with original text and recorded in `validation.issues`
- [ ] 14.4 Validator unit-tested with crafted invented skills, numbers, employers
- [ ] 14.5 Templates "Classic" and "Compact" (@react-pdf/renderer)
- [ ] 14.5 ATS-friendly output (single column, standard headings, selectable text, bundled fonts)
- [ ] 14.5 One-page fitting (drop oldest bullets, font 10.5 -> 10 -> 9.5; 2 pages only if > 5 years)
- [ ] 14.5 File name `<First>_<Last>_Resume_<Company>.pdf` (sanitized)
- [ ] 14.5 Test renders a PDF and extracts text with pdf.js
- [ ] 14.5 "Generate a clean base resume from my profile" option
- [ ] 14.6 Validation issues send the application to Review regardless of score
- [ ] 14.6 First `requireApprovalForFirstTailored` (default 5) tailored resumes need approval
- [ ] 14.7 Naukri disables tailored option with explanation; per-site options per table

## 15. Cover letters and interview prep

- [ ] 15.1 `coverLetter.mode` off/ask/always
- [ ] 15.1 150-250 words, addressed to hiring team, mentions picked projects and met requirements
- [ ] 15.1 Same validator as resumes
- [ ] 15.1 PDF rendering when a file is required
- [ ] 15.1 Saved as `CoverLetter`, editable, copy button in Assist
- [ ] 15.2 "Prepare for interview" (questions, talking points, skills, questions to ask), saved with the application

## 16. Apply engine

- [ ] 16.1 `resolveMode(url)` returns auto only for exact allowlisted hosts; known Assist hosts; generic otherwise
- [ ] 16.1 `resolveMode` tested with tricky URLs (`jobs.lever.co.evil.com`, query-string tricks, subdomains, uppercase)
- [ ] 16.2 `SiteAdapter` interface as specified; only Auto adapters implement `findSubmitControl`
- [ ] 16.2 Selectors in one file per adapter; labels/text/ARIA preferred; CONTRIBUTING explains fixing adapters
- [ ] 16.3 Collect visible, enabled controls incl. custom comboboxes, date pickers, file inputs
- [ ] 16.3 Label resolution order (label for, aria-labelledby, aria-label, wrapping label, legend/preceding text, placeholder, name) + normalization
- [ ] 16.3 Rule-table classifier in `lib/apply/fields/rules.ts` with all canonical keys
- [ ] 16.3 150+ classification tests incl. Indian forms
- [ ] 16.3 Value resolution order: profile -> answer bank (exact, fuzzy Jaccard >= 0.9, type/options fit) -> sensitive stop -> EEO decline -> AI (confidence >= 0.75, exact option match, maxlength) -> unknown handling
- [ ] 16.3 New AI answers saved as `pending_approval` and reused only after approval
- [ ] 16.3 Option matching helpers (yes/no, notice buckets, year buckets, LPA ranges, country/state codes, phone formats, skill years) unit-tested
- [ ] 16.4 Native value setter + input/change/blur events
- [ ] 16.4 Native selects; custom comboboxes via `safeClick()` with verification
- [ ] 16.4 Checkboxes/radios clicked only when state differs
- [ ] 16.4 File attach via `DataTransfer` with verification
- [ ] 16.4 Attach resume first, wait for idle (1.5 s quiet, 10 s max), then fill and correct pre-filled values
- [ ] 16.4 Re-scan up to 3 passes for conditional questions
- [ ] 16.4 Highlight overlay (green/blue/yellow) with field-source panel and "Undo autofill"
- [ ] 16.5 Persisted queue state machine (pending -> preparing -> running -> done/needs_you/failed, waiting_pause); max 2 transient retries
- [ ] 16.5 Eligibility checks (enabled + explanation, allowlisted host, no previous application/dedupe, caps, active hours, threshold/approval, profile basics)
- [ ] 16.5 Prepare step (description, analyzeJd, resume choice, tailoring, cover letter)
- [ ] 16.5 Open in background tab without focus; go to known apply URL directly
- [ ] 16.5 Pre-submit checks (CAPTCHA, verification, required fields, confidence, sensitive sources, consent, dry run, host guard)
- [ ] 16.5 Submit only through the guarded submit function
- [ ] 16.5 Confirmation detection (30 s), one re-fill on validation errors, `unconfirmed` otherwise
- [ ] 16.5 Record answersSent with sources, resume, cover letter, confirmation, events; close tab; batched notification
- [ ] 16.5 Pause between items via alarm
- [ ] 16.5 Kill switch in popup and dashboard
- [ ] 16.5 Auto-pause after 3 consecutive failures or any CAPTCHA, with notification
- [ ] 16.5 Needs-you items keep prepared data; "Open & finish" reopens and refills
- [ ] 16.6 Assist side panel: score, reasons, missing skills, resume options, cover letter copy, Autofill + shortcut, saved answers, "Mark as applied"
- [ ] 16.6 Autofill each new step only on the viewed tab, never clicking forbidden controls
- [ ] 16.6 Confirmation creates an Assist `Application`; otherwise asks "Did you submit this application?"
- [ ] 16.6 Logged-out banner; never fills login forms

## 17. Site adapters

- [ ] 17 "Report a broken page" copies diagnostics without personal data
- [ ] 17.1 Naukri: badges, job page reading, save, side panel
- [ ] 17.1 Naukri chatbot: fill free text, highlight (never click) option chips; user presses send
- [ ] 17.1 Naukri "Apply on company site" -> offer Auto via ATS when allowlisted (queues only the ATS URL)
- [ ] 17.1 Naukri LPA formatting and login detection
- [ ] 17.2 Indeed: badges, job details, Indeed Apply steps (verified flow), resume attach, country subdomains, company-site links, login detection
- [ ] 17.3 LinkedIn: off by default, optional permission after explanation, badges, job view, Easy Apply steps, external Auto links
- [ ] 17.4 Workday: optional permission; My Information, My Experience (Add blocks allowed), Application Questions, Voluntary Disclosures, Self Identify (decline by default)
- [ ] 17.5 Generic adapter injected on demand; fills only
- [ ] 17.6 Auto adapters (Greenhouse both UIs, Lever, Ashby, Workable, SmartRecruiters) with fixtures from real form structure
- [ ] 17.6 Each Auto adapter detects confirmation and errors
- [ ] 17.6 Embedded Greenhouse forms use the hosted URL

## 18. User interface

- [ ] 18 Accessible (keyboard, ARIA, contrast, focus), light/dark, responsive
- [ ] 18 Loading, empty, error states on every list; error boundaries on every route
- [ ] 18.1 `#/matches` with filters, sort, bulk actions, "AI-score the next 20" with quota, virtualized rows
- [ ] 18.1 `#/jobs/:id` with sanitized description, match breakdown, reasons, red flags, gaps, same-company info, actions
- [ ] 18.1 `#/review` approval queue with resume preview, answers (AI highlighted), cover letter, approve/edit/reject, bulk approve
- [ ] 18.1 `#/needs-you` with "Open & finish" and "Answer & retry"
- [ ] 18.1 `#/tracker` Kanban + list, drawer (timeline, resume, answers, cover letter, notes, follow-up, prep), CSV export
- [ ] 18.1 `#/resumes` base, generated base, tailored by job; preview, download, delete, template picker
- [ ] 18.1 `#/answers` search, edit, delete, mark sensitive, approve pending
- [ ] 18.1 `#/profile` all sections, projects with toggles and GitHub sync, preferences
- [ ] 18.1 `#/companies` personal boards, hidden companies, suggest for shared list
- [ ] 18.1 `#/analytics`
- [ ] 18.1 `#/settings` all sections listed in 18.1
- [ ] 18.1 `#/onboarding`
- [ ] 18.2 Context-aware side panel
- [ ] 18.3 Popup counts, pause/resume, open dashboard, open side panel
- [ ] 18.4 Notifications: digest, batched needs-you, follow-ups, auto-apply paused; click opens the right route

## 19. Tracker and analytics

- [ ] 19.1 Applications start at `applied`; stage changes are timestamped events
- [ ] 19.1 Notes, interview dates, contacts per application
- [ ] 19.2 Follow-up reminder after `followUpDays`; "Mark as ghosted?" after `ghostedAfterDays`
- [ ] 19.2 Optional AI follow-up email draft (copy only; never sends email)
- [ ] 19.3 Applications per week by mode; response rate by platform, resume type, score bucket; funnel; skill gaps; AI usage; empty states

## 20. Backup and data control

- [ ] 20 Export to `jobcopilot-backup-YYYY-MM-DD.json` with files as base64; keys only when ticked
- [ ] 20 Import with schema-version check and migration; Merge or Replace
- [ ] 20 Sync settings and answer-bank mirror within quota; secrets never sync
- [ ] 20 "Delete everything" requires typing DELETE; clears all storage
- [ ] 20 Retention: prune closed jobs > 60 days unless saved/applied; prune expired AI cache daily

## 21. Security and privacy

- [ ] 21 Secrets masked in UI, never logged or in error reports
- [ ] 21 DOMPurify on all external HTML
- [ ] 21 No remote code, no `eval`, strict CSP
- [ ] 21 Content scripts in isolated world; no profile data to page scripts or `postMessage`
- [ ] 21 Background validates messages and senders
- [ ] 21 No analytics or telemetry
- [ ] 21 Privacy policy page on the website
- [ ] 21 Dependencies pinned, lockfile committed, `pnpm audit` in CI (warn on low)

## 22. Testing

- [ ] 22.1 `shared` unit tests (schemas, tagger, parsers, normalizers, detection, Go golden parse)
- [ ] 22.1 Extension unit tests for every item listed in 22.1
- [ ] 22.1 AI task tests with a fake OpenAI-compatible client (repair retry, validation failure, 429, fallback)
- [ ] 22.1 Component tests (onboarding steps, matches filters, review queue, auto-apply enable flow)
- [ ] 22.2 E2E onboarding with fictional resume and mocked AI
- [ ] 22.2 E2E feed sync against a local fixture feed server
- [ ] 22.2 E2E autofill on Greenhouse, Lever, Ashby fixtures
- [ ] 22.2 E2E Assist fixtures (Naukri, Indeed) prove no submit/next/continue/send click
- [ ] 22.2 E2E Auto dry run + full submit on test-only fixture host with recorded Application
- [ ] 22.2 Production build excludes the fixture host
- [ ] 22.3 Go tests (fixtures, golden cases, diff, golden output, vet, race; live behind tag)
- [ ] 22.4 Tests never contact real job sites, submit, or use real personal data
- [ ] 22.4 CI runs unit, Go, builds, and e2e (new headless or virtual display)

## 23. CI/CD and distribution

- [ ] 23.1 `ci.yml`: frozen install, lint, typecheck, unit, Chrome + Firefox builds, Go vet/test/build, e2e, pnpm + Go caching
- [ ] 23.2 `crawl.yml`: 6-hourly + manual, permissions, concurrency group, data branch (orphan if missing), crawl, commit data, site build with `/feed`, Pages deploy, run summary
- [ ] 23.3 `release.yml`: on `v*` tags, Chrome/Edge + Firefox zips + sources zip, release with SHA-256 checksums and notes
- [ ] 23.4 `docs/PUBLISHING.md` (Edge, AMO with sources, Chrome load-unpacked, optional Chrome Web Store, listing text, screenshots, justifications, privacy URL)
- [ ] 23.5 Site pages: Home, Install, Get a free Gemini key, Privacy Policy, FAQ, Feed status
- [ ] 23.6 User-only steps documented in README and final message
- [x] 23.6 `pnpm run set-owner` script updates every owner placeholder

## 24. Phases

- [x] 24 Phase 0 - Setup accepted
- [x] 24 Phase 1 - Shared foundations accepted
- [ ] 24 Phase 2 - Go crawler accepted
- [ ] 24 Phase 3 - Data layer and feed sync accepted
- [ ] 24 Phase 4 - Onboarding and profile accepted
- [ ] 24 Phase 5 - Matching accepted
- [ ] 24 Phase 6 - Resume tailoring and cover letters accepted
- [ ] 24 Phase 7 - Apply engine core accepted
- [ ] 24 Phase 8 - Auto pipeline accepted
- [ ] 24 Phase 9 - Assist adapters accepted
- [ ] 24 Phase 10 - Tracker, notifications, analytics, data control accepted
- [ ] 24 Phase 11 - Polish and release accepted
- [ ] 24 "Load demo data" button in development builds

## 25. Definition of done

- [ ] 25 CI green; no TypeScript errors; lint clean
- [ ] 25 Every section 2 rule implemented in code with its covering test listed here
- [ ] 25 Chrome/Edge and Firefox builds work
- [ ] 25 Works fully without an AI key
- [ ] 25 All docs complete; CONTRIBUTING covers adding a company, a skill, a site adapter, fixing an adapter
- [ ] 25 Final message: what was built, how to run, manual steps from 23.6, known limitations

## 26. Out of scope (must stay absent)

- [ ] 26 No auto-submit or submit/next/continue clicks on Assist sites
- [ ] 26 No background searching or scraping of job boards
- [ ] 26 No email reading
- [ ] 26 No job-site passwords or account creation
- [ ] 26 No server, backend, hosted database, or paid service
- [ ] 26 No CAPTCHA solving or bot-detection workarounds
- [ ] 26 No mobile app

## Deferred

_None yet._
