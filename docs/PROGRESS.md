# Progress

## Current phase

**Phase 6 - Resume tailoring and cover letters** (starting)

## Done

### Phase 5 - Matching (accepted 2026-11-02)

- Local prefilter (spec 12.1): hard filters from the preferences with reasons, and the
  skills/title/experience score with named weights, tested with fixtures. 10,000 jobs score in
  about 0.6 s.
- AI scoring (`scoreJobs`): passing jobs in batches of 10 within the daily scoring budget, short
  job keys, red flag and score cap for job text aimed at AI. Runs in the background after every
  sync (up to 50 jobs) and on request.
- Matches page: scores with "estimate" labels, filters (score, status, mode, platform, country,
  workplace, posted date, company, salary), sort, bulk save/hide, "AI-score the next 20" with
  quota, "Learn next" skill gaps; filters kept in a Zustand store.
- Job detail page: full description fetched on demand from each board and sanitized with
  DOMPurify, match breakdown, "Score with AI", other jobs and past applications at the company.
- Re-ranking after profile and preference changes with "Re-score top 50 with AI"; onboarding
  Done step ranks jobs and AI-scores the top 20; matching settings (thresholds, budgets, rate
  limits).
- Tests: 180+ extension unit and component tests; E2E covers ranked matches, AI scores, the job
  page (description fetched from a routed posting, script removed) and kept filters. E2E tests
  now block every outside host.

### Phase 4 - Onboarding and profile (accepted 2026-11-02)

- AI layer: OpenAI-compatible client for Gemini (default `gemini-3.5-flash-lite`), Groq,
  OpenRouter, Ollama and custom endpoints (base URLs verified); scheduler with token bucket,
  daily budget, priorities, 429 backoff and fallback provider; SHA-256 cache with TTLs;
  redaction of contacts, profile links, DOB, addresses and the user's name; JSON validation with
  one repair retry. Tasks `extractProfile` and `describeProject`.
- AI settings form (provider, key kept on this device, model list, test, fallback, host
  permission request) and today's usage, in onboarding and Settings.
- Resume upload (PDF via bundled pdf.js worker, DOCX via mammoth, 5 MB limit, scanned-resume
  warning), local contact extraction and name guess, stored as the base resume.
- Profile editor for every section with "please check" highlights, experience total and skill
  years; preferences form with India CTC helpers (LPA, lakh, crore); job preferences.
- GitHub import: repo list with rate-limit display, forks/archived unticked, details only for
  ticked repos, 7-day cache, optional token, AI or GitHub-filled descriptions, merge with resume
  projects, per-project toggles.
- Nine-step onboarding wizard that saves progress after each step; Profile page (profile,
  answers and job preferences, saved answers with approval of AI suggestions).
- Tests: 150+ extension unit and component tests (Testing Library); Playwright onboarding with
  the fictional resume and a mock OpenAI-compatible server (checks nothing personal reached the
  AI), and the same flow with AI skipped.

### Phase 3 - Extension data layer and feed sync (accepted 2026-11-02)

- Dexie schema with every table and index from the spec, plus a migration test.
- Settings (sync storage, Zod-validated, dev builds start in dry run), secrets and runtime flags
  (local storage only).
- Typed message bus with Zod schemas and sender rules; background handlers for feed, boards and
  job status.
- Feed sync: snapshot with SHA-256 check, ETag, daily shards, closed files, gap detection,
  unknown-version stop; keeps user statuses.
- Personal company boards: add by URL, direct API fetch, TypeScript normalizer proven identical
  to Go on the fixtures, closes missing jobs only after successful fetches, suggestion issue link.
- Alarms (feed and boards every 6 h, feed on startup); manifest permissions documented.
- Dashboard: hash router with error boundaries, virtualized job list (search, mode filter,
  save/hide), feed status bar, companies page, feed URL setting, onboarding placeholder.
- Playwright e2e in Chromium: 3,000-job local fixture feed and a fixture-backed personal board.
  Runs in CI.

### Phase 2 - Go crawler (accepted 2026-11-02)

- Verified every API with live GET requests; trimmed fixtures in `crawler/testdata/fixtures/`.
- Go ports of the normalizer, tagger, experience/location/remote parsers and URL detection pass
  every shared golden case (Go and TypeScript agree).
- Fetchers: Greenhouse (embed apply form), Lever (incl. EU), Ashby, SmartRecruiters (capped
  detail fetches), Workable widget API. Polite HTTP client (limits, retries, Retry-After).
- State and diff (failed fetches close nothing), feed writer (snapshot, daily shards, closed
  files, companies, index with SHA-256, 30-day retention), developer-role filter.
- Commands: `crawl`, `validate-companies [--fix]`, `discover`, `stats`. Live contract tests
  behind `-tags=live`.
- `companies.json`: 166 verified companies (37 hiring in India, 68 remote).
- First live crawl: 9,587 developer jobs, 9.5 MB snapshot, validated with Zod.
- `crawl.yml` (every 6 h + manual) and a placeholder site with a feed status panel.

### Phase 1 - Shared foundations (accepted 2026-11-02)

- Zod schemas: feed contract (FeedJob, snapshot, shards, closed shards, index, public companies)
  and the full data model (profile, projects, preferences, answer bank, jobs, scores, JD
  analysis, applications, queue, resumes, cover letters, files, companies, AI cache, settings
  with all defaults, local-only secrets).
- `skills.json` (432 skills, aliases, categories, ambiguous names with context patterns,
  `implies`), `locations.json` (75 countries, states, 230 cities), `fold.json` (accent folding).
- TypeScript tagger, experience parser, location parser, remote detection, text normalizer,
  snippet maker, and careers URL/HTML platform detection.
- Golden cases shared with Go: skills (202), experience (50), locations (88), remote (18),
  normalize (14), platform URLs (54). 513 tests pass.

### Phase 0 - Setup (accepted 2026-11-02)

- Prerequisites: Node 24.19, pnpm 12.16, Git 2.55, Go 1.27.3 (pinned in `go.mod`; the local 1.24
  install downloads it automatically). Chrome and Edge installed; Firefox to install before
  Phase 11.
- pnpm workspace (`shared`, `extension`, `site`), TypeScript 6.0.3 strict, ESLint (type-checked)
  and Prettier, Vitest.
- `shared` package with `config.ts` (app name, owner/repo, feed URL, `AUTO_SUBMIT_HOSTS`,
  politeness limits).
- WXT extension (React 19 + Tailwind 4): Chrome/Edge MV3 and Firefox MV2 builds, empty dashboard,
  opens on install and on toolbar click. `pnpm dev` opens Chrome with the extension loaded.
- Go crawler skeleton with subcommand stubs and the User-Agent constant.
- `set-owner` script (owner + repo), run with `Nitish2185 Job-copilot`.
- `ci.yml` (format, lint, typecheck, tests, both builds, audit; Go gofmt/vet/race tests/build) -
  green on GitHub.
- Docs: README, LICENSE (MIT), CONTRIBUTING, ARCHITECTURE, PERMISSIONS, DECISIONS, PROGRESS,
  REQUIREMENTS.

## Next

Phase 6: `analyzeJd` (cached per job), `pickProjects` with a fallback, `tailorResume`
(structured changes only), the validator, two PDF templates with bundled fonts, one-page fitting,
preview with "What changed" and editing, `ResumeVersion` storage, a generated base resume, and
cover letters. Job page actions "Apply with a tailored resume" and "Generate cover letter" arrive
here.

## Waiting on the owner

- Turn on GitHub Pages (Settings > Pages > Source: GitHub Actions) and run the "Crawl jobs"
  workflow once from the Actions tab. Until then the scheduled crawl fails at the deploy step.

## Known issues

- Firefox build warns that new add-ons must declare `data_collection_permissions`. Decide the
  declaration with the store listing in Phase 11.
- Go race tests only run in CI (no C compiler on this machine).
- A local crawl from this machine once failed Bosch's 50-page SmartRecruiters listing on a DNS
  hiccup; the crawler kept its previous jobs as designed.

## How to continue

Read this file, then `docs/DECISIONS.md`, then the spec section for the current phase in
`docs/spec/`. Tick items in `docs/REQUIREMENTS.md` as they land. Commit each feature separately
and push to `main` after every change, with the `Co-Authored-By: Claude` trailer.
