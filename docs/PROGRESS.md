# Progress

## Current phase

**Phase 3 - Extension data layer and feed sync** (starting)

## Done

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

Phase 3: Dexie schema and migrations, settings store (sync) and secrets (local), typed
messaging bus, alarms, feed sync (snapshot, deltas, ETag, closed jobs, unknown schema version),
personal boards (URL detection, direct fetch, TypeScript port of the normalizer with the same
golden cases including `html.cases.json`), hash-routed dashboard with a virtualized job list.

## Waiting on the owner

- Turn on GitHub Pages (Settings > Pages > Source: GitHub Actions) and run the "Crawl jobs"
  workflow once from the Actions tab. Until then the scheduled crawl fails at the deploy step.

## Known issues

- Firefox build warns that new add-ons must declare `data_collection_permissions`. Decide the
  declaration with the store listing in Phase 11.
- Go race tests only run in CI (no C compiler on this machine).
- Default Gemini model name and AI base URLs are unverified until Phase 4.
- Spec items for the tagger, parsers and URL detection (7.4, 7.5, 7.9) stay unticked until the
  Go ports pass the same golden cases in Phase 2.

## How to continue

Read this file, then `docs/DECISIONS.md`, then the spec section for the current phase in
`docs/spec/`. Tick items in `docs/REQUIREMENTS.md` as they land. Commit each feature separately
and push to `main` after every change, with the `Co-Authored-By: Claude` trailer.
