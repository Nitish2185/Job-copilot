# Decisions

Choices the spec leaves open, or where the owner overrode the spec. Newest at the bottom of each section.

## Process

- **Commit per feature and push to `main` after every change.** The owner asked for this; it replaces spec rule 0.5 ("commit per phase, never push"). Lint, typecheck and tests must pass before each push so `main` stays green.
- **Repo settings, version tags, releases and store submissions stay with the owner.** The rest of rule 0.5 still applies to Claude.
- **Conventional Commits** (`feat(scope): ...`, `fix:`, `docs:`, `chore:`, `ci:`, `test:`) so history reads per feature.
- **Owner/repo is `Nitish2185/Job-copilot`** (mixed case, as created on GitHub). Filled in from the start with the `set-owner` script, which takes both owner and repo name because the repo is not called `job-copilot`.
- **Spec copies live in `docs/spec/`; the original `prompt/` folder is git-ignored.** Avoids two copies in the repo.
- **Personal agent tooling (`.agents/`, `.claude/`, `.aider-desk/`, `skills-lock.json`) is git-ignored.** Not part of the project.
- **LF line endings enforced with `.gitattributes`.** Golden files must compare byte-for-byte on Windows and in CI.

## Tooling

- **Go version pinned to 1.27.3 through `go.mod`.** The local Go 1.24.0 is a manual install (not winget), so Go's built-in toolchain switching (`GOTOOLCHAIN=auto`) downloads 1.27.3 automatically; CI reads the same version from `go.mod`.
- **TypeScript pinned to 6.0.3, not 7.0.x.** `typescript-eslint` 8.72 supports TypeScript `<6.1.0` only, and the spec requires ESLint with typescript-eslint. Revisit when typescript-eslint supports TS 7.
- **ESLint uses `strictTypeChecked` + `stylisticTypeChecked` with the project service.** Catches floating promises and unsafe `any` in async extension code; Prettier handles formatting (`eslint-config-prettier`).
- **`@types/node` pinned to the Node 24 line (24.19.2).** Matches the Node LTS used locally and in CI.
- **WXT auto-imports are off (`imports: false`).** Every file imports `browser` from `wxt/browser` and helpers from `wxt/utils/*`, so code reads without generated globals and ESLint needs no extra setup.
- **Firefox builds use Manifest V2, Chrome/Edge MV3.** WXT 0.21's default and recommendation (spec 9.6). Firefox add-on ID is `job-copilot@<owner>.github.io`, derived from `GITHUB_OWNER`.
- **`web-ext` installed as a dev dependency.** WXT needs it to open a browser on `pnpm dev`; the dev profile lives in `extension/.wxt/chrome-data` (git-ignored) so data survives restarts.
- **Go race tests (`-race`) run in CI only.** The race detector needs cgo and a C compiler, which this Windows machine does not have; `ubuntu-latest` runners do. Locally `pnpm test:go` runs the same tests without `-race`.
- **Crawler repo URL and User-Agent live in `crawler/internal/project`.** One Go constant for `set-owner` to rewrite.
- **GitHub Actions pinned to major version tags (`@v7`), not commit SHAs.** Readable and still gets security patches; all actions are first-party or pnpm's own.
- **`pnpm audit --audit-level=high` in CI.** Low and moderate advisories are printed but do not fail the build (spec 21).

## Data contracts

- **`snapshot.json` is an object `{ schemaVersion, generatedAt, jobs }`, not a bare array.** Leaves room for metadata; the spec only says "all currently open jobs".
- **Public `companies.json` is `{ generatedAt, companies: [...] }` with `lastStatus` in `ok | empty | not_found | error`.** The spec names the fields but not the shape.
- **All timestamps are UTC ISO-8601 with `Z`.** The crawler converts API offsets to UTC; ISO strings sort correctly in IndexedDB indexes and survive JSON export.
- **Feed `schemaVersion` parses as any positive integer.** The extension compares it with `FEED_SCHEMA_VERSION` and shows "Update the extension" instead of failing to parse.
- **Schema URLs accept only http(s).** Zod's `z.url()` alone also accepts `javascript:`.
- **Fields added to the spec's data model:** `Job.alsoListedOn` and `Job.descHash` (de-duplication, 13.8, and feed change detection), `Application.interviewDates`, `contacts` and `dryRun` (tracker 19.1, dry run 16.5), `Preferences.minSalary` (onboarding step 7), `Company.variant` / `SeedCompany.variant` (`"eu"` for Lever EU boards), `ResumeVersion.document` optional (an uploaded base resume keeps only its original file), `Settings.sources.adzuna/jsearch.maxCallsPerDay` (13.3) and `Settings.sources.indeedCountry` (13.6).
- **Kill-switch and pause state are not settings.** They live in `chrome.storage.local` runtime flags so a pause on one device never syncs to another.
- **Default Gemini model is `gemini-flash-latest` until verified in Phase 4.** The spec asks for a current free Flash-class model and says to verify names during development.
- **Settings use Zod `.prefault({})` on each section.** `SettingsSchema.parse({})` yields all defaults, and partial stored settings are filled in on read.

## Skills and text matching

- **Skill dictionary adds an optional `implies` field.** Stacks and frameworks bring their base skills: `mern` -> mongodb, express, react, nodejs; `spring-boot` -> spring -> java; `nextjs` -> react; `aws-lambda` -> aws. Matching a "MERN stack developer" job against a profile listing React and Node otherwise fails.
- **Context patterns are plain phrases, not regexes.** Go's RE2 has no lookarounds, so both taggers use substring search plus explicit boundary rules; the same code runs identically in TypeScript and Go.
- **A longer alias hides only matches fully inside it.** "react native" hides "react", "sql server" hides "sql", but "REST API design" still tags both REST APIs and API design.
- **Text is normalized to ASCII before matching** (lowercase, Unicode dashes to "-", other non-ASCII to spaces). String positions then mean the same in UTF-16 and UTF-8.
- **Snippets are cut by whole characters while the UTF-16 length is at most 300.** Always passes the schema's `max(300)` and is computable identically in Go.
- **Golden case files and data files are excluded from Prettier** so they stay one entry per line.
- **Accented Latin letters are folded to ASCII before matching** (`shared/data/fold.json`, generated from Unicode NFD plus overrides such as ß -> ss). "Zürich", "São Paulo" and "Kraków" then match; Go loads the same table.
- **Location parsing is data-driven** (`shared/data/locations.json`: 75 countries, US/Canadian/Australian/Indian states, 230 cities). Bare 2-3 letter codes resolve last: a state of a country whose city was found wins ("Indianapolis, IN" -> US), otherwise an ISO country code ("Remote, IN" -> India), otherwise a state. Ambiguous names that cause more harm than good (Georgia, Victoria, Cambridge, Birmingham, Reading) are left out on purpose.
- **Remote detection** uses API fields first (`workplaceType`, `isRemote`), then "hybrid" before "remote" / "wfh" / "work from home" in locations and title.
- **Platform detection returns `token: null` when only a job ID is known** (`?gh_jid=`, `?ashby_jid=`, `apply.workable.com/j/<code>`). The caller then looks for an embedded board in the page HTML, or asks the user for the board link.
- **Lever EU boards are marked `variant: "eu"`** in detection results, personal companies and the seed list, so fetchers use `api.eu.lever.co`.
- **Board tokens keep their original case.** SmartRecruiters tokens are mixed case (`BoschGroup`); case handling for the other APIs is verified against live responses in Phase 2.

## Job-board APIs (verified with live GET requests on 2026-11-02)

- **Greenhouse** `boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true` works as the spec says, plus `first_published` (used for `postedAt`; `updated_at` is the fallback). `content` is entity-escaped HTML. Timestamps carry offsets and are converted to UTC.
- **Greenhouse `applyUrl` is the embed form `https://job-boards.greenhouse.io/embed/job_app?for={token}&token={id}`.** The hosted job URL (`job-boards.greenhouse.io/{token}/jobs/{id}`) redirects to the company's own careers site when it has one (Stripe -> stripe.com), which is not an Auto host. The embed form returns the application form with no redirect for every company tested. `url` is the API's `absolute_url`.
- **Lever** `api.lever.co/v0/postings/{token}?mode=json` works; postings also carry `country` (ISO-2) and `workplaceType` (`onsite` | `hybrid` | `remote` | `unspecified`), `hostedUrl` and `applyUrl` on jobs.lever.co.
- **Ashby** `api.ashbyhq.com/posting-api/job-board/{token}?includeCompensation=true` works. `workplaceType` (`Remote` | `Hybrid` | `OnSite`) can disagree with `isRemote`, so `workplaceType` wins. Salary comes from `compensation.summaryComponents` (`compensationType: "Salary"`, `interval: "1 YEAR"`). Addresses carry `addressCountry`, used as an extra hint for country parsing. Titles can have stray spaces.
- **SmartRecruiters** list endpoint has no descriptions; details come from `/postings/{id}` (`jobAd.sections.*.text`, `postingUrl`, `applyUrl` on jobs.smartrecruiters.com). Large employers list thousands of postings, so detail fetches are capped per company per run and the rest are filled in by later runs. Visa returned no postings (moved off SmartRecruiters).
- **Workable is included** via the widget API `apply.workable.com/api/v1/widget/accounts/{token}?details=true` (jobs with `shortcode`, `application_url` on apply.workable.com, HTML `description`, `locations[].countryCode`). Many accounts return an empty list through it; `validate-companies` removes them.
- **Fixtures** in `crawler/testdata/fixtures/` are trimmed real responses with emails and the one recruiter name replaced.
- **`data/state/seen.json` is `{ jobs: { id: entry }, companies: { key: { lastOkAt, lastStatus, jobCount } } }`.** The spec's per-job map plus per-company status, which the public companies.json needs across runs (`lastOkAt`).
- **A job that reappears after closing is announced again** (in that day's shard) with its original `firstSeenAt`, so extensions that marked it closed reopen it.
- **A 404 counts as a failed fetch** and closes nothing (spec 7.7). The company keeps its last jobs until `validate-companies --fix` removes it; removing a company from companies.json closes its jobs on the next run.
- **The shared feed keeps developer roles only** (`crawler/internal/normalize/roles.go`): titles with engineering, data, QA, security, DevOps and similar words, or titles that name a known skill; "business development" and "data entry" are dropped. Large employers list thousands of sales, operations and manufacturing jobs that would push `snapshot.json` past 15 MB without helping a developer. SmartRecruiters applies the filter before fetching descriptions. `crawl --all-roles` turns it off. Personal company boards in the extension are not filtered.
- **pnpm's minimum release age policy stays on.** Packages published in the last day are refused; instead of adding exceptions, pin the newest release that is old enough (e.g. `globals` 17.13.0, `@vitejs/plugin-react` 6.1.2). If an install adds `minimumReleaseAgeExclude` to `pnpm-workspace.yaml`, remove it and pick an older version.
- **The `data` branch is replaced by one fresh commit on every crawl** (force-push from the workflow). `snapshot.json` is ~10 MB and changes every 6 hours; normal commits would add hundreds of MB of history a month. A single-commit branch still carries the state between runs and still counts as repository activity for GitHub's 60-day schedule rule.
- **Seed list (166 companies) was built by probing candidate board names on each platform, checking that every board belongs to the expected company, and running `validate-companies`** (166 ok). `region` comes from where each company's developer jobs were on 2026-11-02 (countries with 15%+ of its jobs, `REMOTE` at 20%+ remote). 37 companies hire in India and 68 hire remotely; the first live crawl found 9,587 developer jobs (9.5 MB snapshot).

## Extension

- **UI pages read the database with Dexie live queries. Writes that involve syncing, AI or anything rate-limited go through a background message; the user's own edits (profile, preferences, uploaded files, answer-bank edits) are written by the dashboard directly.** Spec 4 asks for Dexie live queries in the UI and spec 9.5 routes shared data and AI through the background; files cannot travel in extension messages, and plain user edits need no shared rate limit.
- **Projects live inside the profile record (`Profile.projects`).** The data model nests them there; the `projects` table stays reserved for a later need.
- **Message replies use `sendResponse` + `return true`** instead of returning a promise from `onMessage`, which works the same in Chrome, Edge and Firefox.
- **Closing a feed job only changes the status of `new` jobs.** Saved, applied, hidden and queued jobs keep their status and get `closedAt`, so nothing the user did disappears; a job that comes back reopens as `new`.
- **Feed sync verifies every checksummed file before writing anything from it**, and a mismatch leaves the previous data in place with an error status.

- **Forms validate by converting to the data model and parsing it with the model's Zod schema** (`lib/profile/form.ts`, `lib/profile/preferencesForm.ts`), which turns Zod issues into plain sentences. Form values are strings (comma lists, "12 LPA", line-per-bullet text), so a `zodResolver` would need a second schema for the form shape; `@hookform/resolvers` was removed.
- **Onboarding progress is the furthest step reached** (`flags.onboardingStep`, local storage). Reopening `#/onboarding` resumes there and every earlier step stays clickable.
- **The resume owner's name is confirmed before the AI reads the resume.** No profile exists yet during onboarding, so the name is guessed locally from the top of the resume, shown for the user to confirm, and sent with the extract request so redaction removes it. Contacts (email, phone, profile links) are extracted locally and shown as "kept on this device".
- **GitHub is called from the dashboard, not the background.** Its limit is per IP, not per provider budget, and the import is user-driven. Repo lists and README details are cached in local storage for 7 days; README details are keyed by the repo's last push.
- **Host permission requests drop the port** (`http://localhost/*` for Ollama on :11434) so they match the manifest's optional host patterns; all origins are requested in one prompt as the first await of the click, which Firefox requires.
- **Turning off the fallback AI provider removes it** (`saveAiProvider`); the generic settings merge keeps old values for missing keys.
- **Lakh and crore mean rupees.** `parseCtc("12 LPA", "USD")` is 12 lakh INR, not 1.2 million dollars. CTC fields default to the currency of the profile's country (INR for IN, EUR for euro countries, USD otherwise).
- **Preferred cities and remote preference are asked once, on the job preferences step** (spec lists them in both steps 6 and 7). Relocation and start date stay on the questions step.
- **Diversity answers are free text with suggestions**; an empty field means "decline to self-identify" and is not stored.

## Matching (Phase 5)

- **Hard filters only exclude what clearly does not fit.** Unknown countries, locations, remote status or job types never exclude a job. A "remote" preference excludes office and hybrid jobs; "hybrid" and "office" preferences exclude nothing on their own. Preferred cities apply only to office and hybrid jobs and are skipped when the user would relocate; city names match their other names from `locations.json` (Bengaluru = Bangalore). Excluded jobs keep a score with the reason and never show on the Matches page.
- **Prefilter details the spec leaves open:** the 12 counted job skills are the title skills first, then the rest (job skills are stored alphabetically, so "the first 12" alone would be arbitrary); profile skills include the skills they imply (Next.js counts as React); the title match is the best share of a desired role's words found in the title, with spelling variants unified (front-end/frontend, engineer/developer) and 0.5 when no roles are set; more experience than `max + 1` scores 0.5.
- **AI scoring sends short job keys (j1..j10)**, never real IDs; unknown keys in the answer are ignored. The daily scoring budget counts jobs and is spent after a successful batch. Background scoring takes up to 50 newest passing jobs per sync; "AI-score the next 20" scores the next 20 estimates in the list as the user sees it.
- **Instruction-like job text is caught by code, not only by the AI.** A pattern check adds the red flag "The job text contains instructions aimed at AI tools", and a flagged job's final score is never above its local score.
- **AI scores belong to a profile version.** After a profile change the prefilter re-runs and AI scores from the old version are dropped (the job shows an estimate) until the user re-scores; preference changes re-run the prefilter too.
- **Jobs are ranked only once the profile has skills.** Before that the Matches page shows every job without a score threshold and points to setup.
- **Descriptions are fetched by the dashboard**, because DOMPurify needs a DOM and the background worker has none. They are stored sanitized and refreshed after 7 days. Greenhouse (`/v1/boards/{token}/jobs/{id}`) and Lever (`/v0/postings/{token}/{id}`) single-job endpoints return the same shape as one list item (verified with GET requests on 2026-11-02); Ashby and Workable boards are cached for an hour per dashboard session.
- **E2E tests block every outside host** unless a test routes it, so no test can reach a real job site.

## AI providers (verified against official docs on 2026-11-02)

- **Base URLs:** Gemini `https://generativelanguage.googleapis.com/v1beta/openai/` (supports `/models` and structured JSON output), Groq `https://api.groq.com/openai/v1`, OpenRouter `https://openrouter.ai/api/v1`, Ollama `http://localhost:11434/v1` (ignores the API key but the client must send one).
- **Default model `gemini-3.5-flash-lite`.** Google recommends 3.5 Flash-Lite or 3.8 Flash for new projects; both are free of charge on the free tier, and Flash-Lite has the larger quota. `gemini-3.8-flash` is offered second.
- **Free-tier Gemini traffic may be used by Google to improve its products** (pricing page). Onboarding says so, and redaction is on by default.
- **No OpenRouter attribution headers.** They are optional and would tell OpenRouter which app the user runs.
