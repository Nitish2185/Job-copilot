# Job Copilot - Full Build Specification
## PART 3 of 3 - Apply engine, site adapters, UI, tracker and analytics, data control, security, testing, CI/CD, build phases

> **Instructions for Claude Code**
>
> This is PART 3, the last part of the specification started in PART 1 and PART 2. All rules in PART 1 section 2 ("Non-negotiable rules") apply here.
>
> - **If you received this part as a pasted message:** save it verbatim to `docs/spec/part-3.md`. Then follow the start signal at the end of this part.
> - **If you are reading from files:** you now have everything. Follow the start signal at the end.

---

## 16. Apply engine

### 16.1 Mode resolution

`resolveMode(url): { mode: "auto" | "assist", adapterId }`

- Host exactly in `AUTO_SUBMIT_HOSTS` -> `auto`, with that platform's adapter.
- Known Assist host (Naukri, Indeed, LinkedIn, Workday, and so on) -> `assist`, with that site's adapter.
- Anything else -> `assist`, generic adapter.
- Unit-test with many URLs, including tricky ones (`jobs.lever.co.evil.com`, `evil.com/?u=jobs.lever.co`, subdomains, uppercase hosts).

### 16.2 Adapter interface

```ts
interface SiteAdapter {
  id: string;                                   // "greenhouse", "naukri", "generic", ...
  mode: "auto" | "assist";
  matches(url: URL): boolean;
  detectPage(doc: Document): "job" | "apply_form" | "confirmation" | "login" | "other";
  isLoggedIn?(doc: Document): boolean | "unknown";
  readJob?(doc: Document): Partial<Job>;        // for "save this job"
  findFields(root: ParentNode): FormField[];    // see 16.3
  fileInputs(root: ParentNode): { resume?: HTMLInputElement; coverLetter?: HTMLInputElement };
  findSubmitControl?(doc: Document): HTMLElement | null;   // ONLY auto adapters implement this
  detectCaptcha(doc: Document): boolean;
  detectVerificationCode(doc: Document): boolean;
  detectConfirmation(doc: Document): { confirmed: boolean; text?: string };
  detectErrors(doc: Document): string[];        // validation errors shown after a submit attempt
}
```

- Auto adapters: `greenhouse` (both the newer `job-boards` UI and the older `boards` UI), `lever`, `ashby`, `workable`, `smartrecruiters`.
- Assist adapters: `naukri`, `indeed`, `linkedin`, `workday`, `generic`.
- Keep every site's selectors in one file per adapter (`adapters/<site>/selectors.ts`). Prefer labels, text, and ARIA roles over CSS class names, which change often. Document in `CONTRIBUTING.md` how to fix a broken adapter.

### 16.3 Understanding form fields

**Collect** visible, enabled controls: inputs, textareas, selects, radio groups, checkbox groups, custom comboboxes (`role="combobox"` with a `listbox`, React-Select style widgets), date pickers, and file inputs.

**Label** each field, in this order: `<label for>`, `aria-labelledby`, `aria-label`, wrapping `<label>`, `<legend>` or nearest preceding question text for groups, placeholder, `name` attribute. Normalize the question text (lowercase, collapse whitespace, strip punctuation and "*").

**Classify** each field into a canonical key using a rule table (`lib/apply/fields/rules.ts`, keyword and regex rules) before any AI is involved. Keys include at least:

```
first_name, last_name, full_name, preferred_name, email, phone, phone_country_code,
address_line, city, state, country, postal_code, current_location,
linkedin, github, portfolio, website, twitter,
current_company, current_title, total_experience_years, total_experience_months,
skill_years:<skillId>, notice_period, serving_notice, last_working_day,
current_ctc, expected_ctc, salary_expectation, salary_currency,
work_authorization:<country>, sponsorship, relocate, willing_onsite, willing_hybrid,
start_date, date_of_birth, gender, pronouns, race_ethnicity, hispanic_latino,
veteran_status, disability_status, how_did_you_hear, referral_name,
education_degree, education_institution, graduation_year, gpa,
cover_letter_text, cover_letter_file, resume_file, privacy_acknowledgement,
background_check_consent, legal_attestation, unknown
```

Write at least 150 unit tests with real-world question strings, including Indian forms ("Current CTC (in LPA)", "Notice period", "Are you an immediate joiner?", "Total experience in years", "Expected CTC", "Current location", "Preferred location").

**Resolve the value** for each field in this order:

1. **Profile and Preferences** for canonical keys (deterministic mapping).
2. **Answer bank:** exact fingerprint match, then fuzzy match (token Jaccard similarity of at least 0.9), and the stored answer must fit the field type and options.
3. **Sensitive categories** (work authorization, sponsorship, salary/CTC, notice period, background check, legal attestations, relocation, date of birth): if steps 1-2 did not resolve them, **stop** -> "Needs you" with reason `missing_sensitive_answer`. When the user answers, save it to the answer bank (marked `sensitive`).
4. **Voluntary diversity questions:** use `Preferences.eeo` if set; else choose the closest "decline to self-identify" option. If no such option exists -> "Needs you".
5. **Other questions:** run `answerQuestion` (AI). Accept only if confidence is at least 0.75, and for select/radio fields only if the answer exactly matches one of the options; respect `maxlength` for text. Mark AI-filled fields clearly (16.4). New AI answers are added to the answer bank as `pending_approval` and are reused only after the user approves them.
6. **Unknown optional field:** leave empty. **Unknown required field:** "Needs you" with reason `unknown_required_question`.

**Option matching helpers** (unit-tested):

- Yes/No synonyms (Yes, Y, True, I do, I am / No, N, False, I don't).
- Notice period buckets ("Immediate", "15 days or less", "1 month", "30 days", "2 months", "3 months", "More than 3 months").
- Year buckets ("0-1", "1-3", "3-5", "5+", "Less than 1 year").
- CTC ranges in LPA ("5-10 LPA", "10-15 Lakhs").
- Country and state names vs codes.
- Phone: separate country-code field when present; otherwise E.164 or the format shown in the placeholder.
- Skill years: `profile.skills[].years`, else derived from experience entries that mention the skill; if still unknown and required -> "Needs you".

### 16.4 Filling techniques

- **Text inputs and textareas:** use the native value setter, then dispatch `input`, `change`, and `blur` so React/Vue forms register the value:

```ts
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("blur", { bubbles: true }));
}
```

- **Native selects:** set the value and dispatch `change`.
- **Custom comboboxes:** open the control, type into its filter input if it has one, choose the option by text, then verify the rendered value. All clicks go through `safeClick()` (PART 1, 2.1).
- **Checkboxes and radios:** click only when the state differs from the desired state.
- **File inputs:** attach with `DataTransfer`, then dispatch `change`; verify that the page shows the file name:

```ts
function attachFile(input: HTMLInputElement, blob: Blob, fileName: string, type = "application/pdf") {
  const dt = new DataTransfer();
  dt.items.add(new File([blob], fileName, { type }));
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}
```

- **Resume parsing by the site:** Greenhouse, Lever, and others may read the uploaded resume and pre-fill fields. Attach the resume first, wait until the form is idle (no DOM changes for 1.5 s, max 10 s), then fill the remaining fields and correct pre-filled values that differ from the profile.
- **Dynamic forms:** after each fill pass, re-scan for newly revealed (conditional) questions; maximum 3 passes per step.
- **Highlight overlay** (Shadow DOM): green outline = filled from profile or answer bank, blue = filled by AI (review it), yellow = needs the user. A floating panel lists every field with its value source, plus "Undo autofill" (restores previous values).
- **Only visible, enabled fields** (PART 1, 2.3).

### 16.5 Auto pipeline (Auto allowlist only)

Each queued application runs as a state machine persisted in IndexedDB:
`pending -> preparing -> running -> (done | needs_you | failed)`, with `waiting_pause` between items. At most 2 retries, and only for transient errors (tab crashed, timeout).

**1. Eligibility** (all must be true, otherwise the item is not queued, with a visible reason):

- `autoApply.enabled` and `explanationAccepted` are true and auto-apply is not paused.
- The job's apply URL host is in `AUTO_SUBMIT_HOSTS`.
- No previous application for this job ID or its `dedupeKey`.
- Per-company cap and daily cap not reached; inside active hours if configured.
- Score at least `threshold`, or the user approved it in the Review queue (`approvalMode: "always"` means every item needs approval).
- All required profile basics exist (name, email, phone, resume).

**2. Prepare:** fetch the description if missing, run `analyzeJd`, choose the resume (per settings and approval rules in PART 2, 14.6), generate and validate a tailored resume if needed, generate a cover letter if needed.

**3. Open:** open `applyUrl` in a **background tab** (`active: false`) without stealing focus. If the URL is a job page rather than the form, go to the platform's known apply URL directly (for example Lever's `/apply` path) instead of clicking around.

**4. Fill:** use 16.3 and 16.4; attach resume and cover letter.

**5. Pre-submit checks** (any failure -> "Needs you" with the reason; never submit):

- No CAPTCHA, no verification-code step.
- Every required field filled; no field filled with low confidence.
- Every sensitive answer came from the profile or answer bank.
- Consent checkboxes handled per PART 1, 2.3.
- **Dry run** setting on -> stop here, show "This is what would be submitted", mark as dry-run.
- Host guard passes (2.2).

**6. Submit:** click the adapter's submit control through the guarded submit function.

**7. Confirm:** wait up to 30 s for confirmation (URL change, adapter-specific success element, or text such as "Thank you for applying", "Application submitted", "We have received your application").

- Validation errors shown -> re-fill the flagged fields once and try again -> otherwise "Needs you" (`validation_error`).
- Neither confirmation nor errors -> status `unconfirmed`, shown for the user to check.

**8. Record:** update the `Application` with `answersSent` (each with its source), `resumeVersionId`, `coverLetterId`, `confirmationText`, timestamps, and events; close the tab; batch a notification.

**9. Pause:** wait `pauseSeconds` using an alarm (service-worker safe) before the next item.

**Safety controls:**

- "Pause all auto-apply" button in the popup and dashboard (kill switch).
- Automatic pause after 3 consecutive failures, or after any CAPTCHA, with the reason shown and a notification.
- "Needs you" items keep everything prepared (resume, answers) so "Open & finish" can reopen the form, refill it, and let the user complete and submit it themselves.

### 16.6 Assist flow

- Side panel on a job or apply page shows: match score with reasons and missing skills, the two resume options (option 2 disabled on Naukri with an explanation), cover letter with a copy button, an **Autofill** button (with its shortcut), suggested saved answers with copy buttons, and "Mark as applied".
- **Autofill:** fills the current step, highlights fields, and the user reviews. The user clicks the site's Continue/Next/Submit. With "Autofill each new step automatically" on, each new step is filled as it appears, only on the tab the user is viewing, never clicking forbidden controls.
- After the user submits: if the adapter detects confirmation, create an `Application` (mode `assist`) automatically with the answers used; otherwise ask in the side panel "Did you submit this application?" (Yes / No).
- **Logged out:** banner "You're logged out of <site>. Please log in, then press Autofill again." Never fill login forms.

---

## 17. Site-specific adapters

General rule: if you have a browser tool during development, you may open public job pages to inspect their structure (read-only: no logging in, no applying, no submitting anything). Otherwise build from documented structure and fixtures, and keep selectors easy to update. Add a "Report a broken page" button that copies diagnostic information **without personal data** (adapter ID, URL path pattern, detected field labels and types, extension version) for a GitHub issue.

### 17.1 Naukri (Assist)

- **Search results:** badges (PART 2, 13.7).
- **Job page:** read job details (title, company, experience, salary, location, skills chips, description); "Save this job"; side panel.
- **Apply:** Naukri usually applies with the resume on the user's Naukri profile. Recruiter questions may appear afterwards in a chat-style panel. Fill free-text answers into the input; for option chips that send the answer immediately, **do not click them**: highlight the suggested chip and let the user click. The user presses send.
- **"Apply on company site":** read the external link; if it is an Auto host, offer "Apply automatically via <platform>" (after the user confirms, this only queues the employer's ATS URL; nothing happens on Naukri).
- CTC and notice period answers use the India helpers (LPA formatting).
- Login detection (Login/Register buttons present, profile menu absent).

### 17.2 Indeed (Assist)

- **Search results:** badges on job cards; job details from the side pane or job page.
- **Indeed Apply flow** (often on a separate apply subdomain; verify): steps for contact info, resume (choose an uploaded resume or upload one; Autofill attaches the chosen PDF when an upload field is present), employer questions, review. Fill each step; the user clicks Continue and Submit.
- Country subdomains (`*.indeed.com`).
- "Apply on company site" handling same as Naukri.
- Login detection.

### 17.3 LinkedIn (Assist, optional permission)

- Off by default. When the user enables it in Settings, explain that it is Assist-only, then request the optional host permission.
- Badges on job search lists; job details from the job view.
- Easy Apply modal: fill each step; the user clicks Next, Review, and Submit.
- External apply links to Auto hosts handled like Naukri.

### 17.4 Workday (Assist, optional permission)

- The user signs in or creates the company account themselves.
- Fill "My Information", "My Experience" (work history and education from the profile; clicking "Add" to create another work-experience or education block is allowed), "Application Questions", "Voluntary Disclosures" and "Self Identify" (decline unless the profile has values). The user clicks "Save and Continue" and "Submit".

### 17.5 Generic (Assist, injected on demand)

- Injected with `activeTab` + `scripting` when the user presses Autofill on an unknown site.
- Generic field discovery and classification from 16.3; fills only.

### 17.6 Auto adapters

- Greenhouse (both UIs), Lever, Ashby, Workable, SmartRecruiters: each with fixtures copied from real application forms (structure only, no personal data), adapted to run on a local test server.
- Each adapter implements confirmation and error detection.
- Detect embedded forms: when a company page embeds a Greenhouse form, use the Greenhouse-hosted URL instead.

---

## 18. User interface

Clean, modern, accessible (keyboard navigation, ARIA labels, good contrast, visible focus), light and dark themes, responsive dashboard. Every list has loading, empty, and error states. Use error boundaries on every route.

### 18.1 Dashboard routes

- `#/matches` - ranked job list (virtualized). Filters: score range, mode (Auto/Assist), platform, country/location, remote, posted within, company, has salary, status. Sort by score, date, or company. Bulk actions: hide, save, queue for auto-apply. "AI-score the next 20" button with remaining-quota indicator. Each row: title, company, location, mode badge, score (with "estimate" label when prefilter only), top matched skills, posted date.
- `#/jobs/:id` - sanitized description; match breakdown (must-have checklist, nice-to-have, experience fit, location and salary fit); reasons and red flags; missing skills; other jobs at the same company and previous applications there; actions: Apply with my resume, Apply with a tailored resume, Generate cover letter, Open job page, Save, Hide, Prepare for interview.
- `#/review` - approval queue for auto-apply: job, score, resume choice (with preview), every answer that will be sent (AI-filled ones highlighted), cover letter; Approve, Edit, Reject; bulk approve.
- `#/needs-you` - stopped items with reasons; "Open & finish" (opens the form, refills it, the user completes and submits); "Answer & retry" for missing answers (answer inline -> saved to answer bank -> re-queued).
- `#/tracker` - Kanban board (Applied, Screening, Interview, Offer, Rejected, Ghosted, Accepted) with drag and drop, plus a list view. Application drawer: timeline of events, resume version used (open the PDF), answers sent, cover letter, notes, follow-up date, interview prep. CSV export.
- `#/resumes` - base resume, generated base resume, tailored versions grouped by job; preview, download, delete; template picker.
- `#/answers` - answer bank: search, edit, delete, mark sensitive, approve pending AI answers.
- `#/profile` - all profile sections, projects (GitHub sync, "Real project" and "Always include" toggles), preferences, job preferences.
- `#/companies` - personal boards (add by URL, enable/disable, last fetched, job count, status), hidden companies, "Suggest for the shared list".
- `#/analytics` - see 19.3.
- `#/settings` - AI (provider, key, model, test, rate limits, fallback, usage), matching thresholds, auto-apply (enable flow with the explanation dialog, threshold, approval mode, caps, pause, active hours, resume default, privacy-acknowledgement toggle, dry run), Assist (autofill each step, badges per site, optional permissions for LinkedIn and Workday), sources (feed URL, personal boards, listing APIs with keys), tailoring (projects to pick, template), cover letters, notifications, privacy (redaction, export, import, delete everything), appearance, keyboard shortcuts, about (version, links, licenses).
- `#/onboarding` - PART 2, section 10.

### 18.2 Side panel

Context-aware: on a job or apply page it shows that job's card and actions (16.6); elsewhere it shows today's top matches, the Needs-you count, and quick links.

### 18.3 Popup

Counts (new matches today, queued, needs you, applied today), Pause/Resume auto-apply, Open dashboard, Open side panel.

### 18.4 Notifications

Daily digest ("18 new matches, 3 strong"), Needs-you alerts (batched), follow-up reminders, auto-apply paused alerts. Clicking a notification opens the right dashboard route.

---

## 19. Tracker, follow-ups, analytics

### 19.1 Tracker logic

- Every application starts at stage `applied` when submitted (Auto or Assist).
- The user moves cards between stages; each change is an event with a timestamp.
- Notes, interview dates, contacts (name, email, role) per application.

### 19.2 Follow-ups

- Follow-up reminder `followUpDays` (default 7) after submission if the stage is still `applied`.
- Suggest "Mark as ghosted?" after `ghostedAfterDays` (default 30).
- Optional follow-up email draft (AI, same no-invention rules) that the user copies; the extension never sends email.

### 19.3 Analytics page

- Applications per week (stacked by mode).
- Response rate (share of applications that reached screening or later) by platform, by resume type (current vs tailored, to show whether tailoring helps), by score bucket.
- Funnel: applied -> screening -> interview -> offer.
- "Learn next" skill gaps (PART 2, 12.3).
- AI usage over time.
- Computed with Dexie queries; charts with Recharts; works with zero data (helpful empty states).

---

## 20. Backup, sync, and data control

- **Export** everything to one JSON file (`jobcopilot-backup-YYYY-MM-DD.json`) including files as base64. API keys are excluded unless the user ticks "Include API keys".
- **Import** with schema-version check and migration; choose "Merge" or "Replace".
- **Sync** settings and the answer-bank mirror through `chrome.storage.sync` within quota (PART 1, section 6). Secrets never sync.
- **Delete everything:** confirmation dialog where the user types DELETE; clears IndexedDB and all storage areas.
- **Retention:** prune closed jobs older than 60 days unless saved or applied; prune expired AI cache entries daily.

---

## 21. Security and privacy

- Secrets in `chrome.storage.local` only; masked in the UI; never logged; never included in error reports.
- Sanitize all HTML from APIs and pages with DOMPurify before rendering; never render unsanitized HTML.
- No remote code, no `eval`, strict extension CSP.
- Content scripts run in the isolated world; never pass profile data to the page's own scripts; never use `window.postMessage` for profile data.
- Background validates every message (Zod) and its sender (9.5).
- Redaction before AI calls (PART 2, 11.5).
- No analytics or telemetry of any kind.
- Privacy policy page on the website: exactly what is stored, where, what is sent to the AI provider the user chose, what is sent to employers, no servers, no tracking, how to export and delete.
- `docs/PERMISSIONS.md` justifies every permission.
- Dependencies pinned; lockfile committed; `pnpm audit` in CI (warn, don't fail, on low severity).

---

## 22. Testing

### 22.1 Unit tests (Vitest)

- `shared`: schemas, skill tagger (shared golden cases), experience and location parsers, normalizers, platform URL detection, Go golden-output parsing with Zod.
- Extension: prefilter formula; field classification (150+ strings); value-resolution order, including that sensitive questions **stop** instead of calling AI; option matching helpers; CTC/LPA parser; redactor; resume validator (invented skills, numbers, employers are stripped); `resolveMode` and the `AUTO_SUBMIT_HOSTS` guard; `isNavigationOrSubmitControl` and `safeClick`; queue state machine with fake timers (caps, pauses, dedupe, kill switch, auto-pause on CAPTCHA); rate limiter; AI cache keys; feed sync (snapshot, deltas, ETag, closed jobs, unknown schema version); de-duplication merge; Dexie migrations (with fake-indexeddb).
- AI tasks: a fake OpenAI-compatible client with recorded responses; test the repair retry, validation failure, 429 backoff, fallback provider.
- Components: key screens with Testing Library (onboarding steps, matches filters, review queue, settings auto-apply enable flow).

### 22.2 End-to-end (Playwright, Chromium with the extension loaded)

- Onboarding with a **fictional** sample resume PDF in fixtures (a made-up person) and a mocked AI provider.
- Feed sync against a local static server serving a fixture feed.
- Autofill on local fixture copies of Greenhouse, Lever, and Ashby application forms.
- Assist fixtures shaped like Naukri and Indeed forms: assert that **no** submit, next, continue, or send control is ever clicked (record click events in the fixture page).
- Auto pipeline in dry-run mode, and a full submit only on a local fixture form whose host is added through the test-only build flag; assert confirmation detection and the recorded `Application`.
- Production build test: the fixture host is not in the built allowlist.

### 22.3 Go tests

Parsers with fixtures, shared golden cases, diff logic, golden output files, `go vet`, `-race`. Live contract tests behind `-tags=live` (GET only, opt-in).

### 22.4 Rules for tests

- Tests never contact real job sites, never submit anything real, and never use real personal data.
- CI runs unit tests, Go tests, builds, and the e2e suite (use Chromium's new headless mode, or a virtual display, as Playwright's docs recommend for extensions).

---

## 23. CI/CD, distribution, website

### 23.1 `.github/workflows/ci.yml`

On push and pull request: install with frozen lockfile, lint, typecheck, unit tests, build the extension for Chrome and Firefox, Go vet/test/build, Playwright e2e. Cache pnpm and Go modules.

### 23.2 `.github/workflows/crawl.yml`

- Triggers: `schedule` every 6 hours (`0 */6 * * *`) and `workflow_dispatch`.
- Permissions: `contents: write`, `pages: write`, `id-token: write`. Use a `concurrency` group so runs never overlap.
- Steps: check out `main`; check out the `data` branch into `./data` (create it as an orphan branch if missing); set up Go; build and run `crawl` (reads `crawler/companies.json` and `shared/data/*.json`, writes `./data/state` and `./data/feed`); commit and push the `data` branch if anything changed (this also keeps the repository active, because GitHub disables scheduled workflows in public repositories after 60 days without activity); build the site; copy `./data/feed` into the site build at `/feed`; upload the Pages artifact; deploy to Pages.
- Write a short run summary (jobs, new, closed, failed companies) to the workflow summary.

### 23.3 `.github/workflows/release.yml`

On tags `v*`: build zips for Chrome/Edge and Firefox (WXT zip commands, plus the sources zip Firefox reviewers need), attach them to a GitHub Release with SHA-256 checksums and auto-generated notes.

### 23.4 Distribution (free)

`docs/PUBLISHING.md` with step-by-step instructions for the user:

- **Microsoft Edge Add-ons** (free developer registration through Partner Center).
- **Firefox Add-ons (AMO)** (free; upload the sources zip because the code is bundled).
- **Chrome users:** download the zip from GitHub Releases, unzip, open `chrome://extensions`, turn on Developer mode, "Load unpacked". Note that Chrome shows a developer-mode notice.
- **Chrome Web Store** is optional later (one-time $5 fee).
- Store listing text, screenshots checklist, permission justifications, privacy policy URL.

### 23.5 Website (`site/`, GitHub Pages)

Pages: Home (what it does, how Auto and Assist differ, screenshots placeholders), Install (store links as placeholders, Chrome load-unpacked steps), Get a free Gemini key (steps), Privacy Policy, FAQ (Is this allowed? Why are Naukri, Indeed, and LinkedIn Assist-only? Where is my data? Does it cost anything?), Feed status (reads `feed/index.json` and `feed/companies.json`: last update, open jobs, companies, failures).

### 23.6 Things only the user can do

Claude Code must not do these; write exact steps in `README.md` and the final message instead:

- Create a **public** GitHub repository and push the code.
- In the repository settings, set Pages source to "GitHub Actions" and allow the workflows to write.
- Replace `<github-user>` placeholders (`FEED_BASE_URL`, Go module path, crawler User-Agent, site links) - provide a single script `pnpm run set-owner <github-user>` that updates all of them.
- Run the crawl workflow once manually.
- Get a Gemini key, load the extension, complete onboarding.
- Create store accounts and submit.

---

## 24. Build phases and acceptance criteria

Work through these in order. At the end of each phase: run all checks, update `PROGRESS.md` and `REQUIREMENTS.md`, commit.

**Phase 0 - Setup**
Prerequisite check; git init; pnpm workspace; WXT + React + TypeScript + Tailwind extension that loads in Chrome with an empty dashboard page; Go module skeleton; `shared` package; ESLint, Prettier, Vitest; `ci.yml`; docs skeleton (`README`, `ARCHITECTURE`, `DECISIONS`, `PROGRESS`, `REQUIREMENTS`, `PERMISSIONS`, `CONTRIBUTING`); `set-owner` script.
*Accept:* the dev command opens a browser with the extension loaded; `pnpm test` and `go test ./...` pass; lint and typecheck clean.

**Phase 1 - Shared foundations**
`skills.json` (300+ skills with aliases and categories), `locations.json`, all Zod schemas (PART 1 sections 6 and 8), TypeScript tagger and parsers, platform URL detection, all shared golden case files.
*Accept:* all shared tests pass.

**Phase 2 - Go crawler**
Fetchers with verified endpoints and fixtures, normalizer, Go tagger and parsers passing the shared golden cases, state and diff, feed writer (snapshot, daily shards, closed files, index, companies), `validate-companies`, `discover`, `stats`, seed `companies.json` with 100+ verified companies, `crawl.yml`, placeholder site deploy.
*Accept:* running `crawl` locally produces a valid feed (validated by the Zod test); all Go tests pass.

**Phase 3 - Extension data layer and feed sync**
Dexie schema and migrations, settings store, messaging bus, alarms, feed sync (snapshot, deltas, ETag), personal boards (URL detection, direct fetch, TypeScript normalizer), basic job list.
*Accept:* the dashboard shows thousands of jobs from a local fixture feed; adding a personal board works against a fixture server.

**Phase 4 - Onboarding and profile**
AI client and provider settings (test button, model list), scheduler, cache, redaction; resume upload and parsing; `extractProfile`; profile editor; GitHub import and `describeProject`; manual projects; preferences with India helpers; job preferences; answer bank basics; works without AI.
*Accept:* full onboarding works with the fictional resume and mocked AI; also works with AI skipped.

**Phase 5 - Matching**
Prefilter, AI batch scoring with budget and quota UI, full Matches page (filters, virtualized list), Job detail page, skill gaps, re-scoring.
*Accept:* scoring tests pass; UI shows scores, reasons, and estimates correctly with mocked AI.

**Phase 6 - Resume tailoring and cover letters**
`analyzeJd`, `pickProjects` with fallback, `tailorResume`, validator, two PDF templates, one-page fitting, preview with "What changed" and editing, `ResumeVersion` storage, generated base resume, cover letters.
*Accept:* validator tests pass; PDF text is extractable in tests; fitting logic tested.

**Phase 7 - Apply engine core**
Field discovery, classification rules (150+ tests), value resolution, option matching, filling techniques, highlight overlay and undo, guards (`AUTO_SUBMIT_HOSTS`, `isNavigationOrSubmitControl`, `safeClick`), generic Assist adapter with Autofill button, shortcut, and context menu; side panel.
*Accept:* e2e autofill on fixtures fills correctly; Assist never clicks forbidden controls (test).

**Phase 8 - Auto pipeline**
Queue state machine, Greenhouse/Lever/Ashby adapters (plus Workable and SmartRecruiters), background-tab orchestration, pre-submit checks, confirmation and error detection, Review queue and Needs-you pages, caps, pauses, kill switch, auto-pause, dry run, the enable-auto-apply explanation flow.
*Accept:* dry-run e2e passes on fixtures; test-only full submit on a local fixture passes; all safety tests pass.

**Phase 9 - Assist adapters**
Naukri, Indeed, LinkedIn (optional permission), Workday (optional permission): login detection, save-from-page (JSON-LD, DOM, AI fallback), search-page badges, "apply on company site" detection, confirmation detection, "Report a broken page".
*Accept:* fixture tests pass; `docs/QA.md` has a manual checklist for the user to try on the real sites.

**Phase 10 - Tracker, notifications, analytics, data control**
Kanban and list views, application drawer, follow-ups and ghosted suggestions, daily digest and alerts, analytics charts, export/import/delete, sync mirror.
*Accept:* tests pass; analytics show sensible output on seeded demo data.

**Phase 11 - Polish and release**
Interview prep, listing APIs (Adzuna, JSearch) behind optional permissions, search links, dark mode, accessibility pass, performance check with 10,000 jobs, empty states and onboarding tips everywhere, complete website, `release.yml`, `PUBLISHING.md`, final README (features, screenshots placeholders, install, development setup, architecture summary), Firefox build checked.
*Accept:* everything in section 25.

Add a "Load demo data" button in development builds (fictional profile, jobs, applications) so every screen can be checked without real data.

---

## 25. Definition of done

- All phases accepted; CI green; no TypeScript errors; lint clean.
- Every rule in PART 1 section 2 is implemented in code, and `docs/REQUIREMENTS.md` lists the test that covers each testable rule.
- Chrome/Edge and Firefox builds work.
- Works fully without an AI key (keyword matching, autofill from profile and answer bank, tracking, base resume).
- Docs complete: `README.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `PERMISSIONS.md`, `PUBLISHING.md`, `QA.md`, `CONTRIBUTING.md` (how to add a company, a skill, a site adapter, and how to fix a broken adapter), privacy policy page, MIT `LICENSE`.
- `REQUIREMENTS.md`: every item ticked or listed under "Deferred" with a reason.
- Final message to the user: what was built, how to run it, the manual steps from 23.6 in order, and known limitations.

---

## 26. Out of scope (do not build)

- Automatic submitting on any Assist site, or any automation that clicks submit/next/continue there.
- Background searching or scraping of Naukri, Indeed, LinkedIn, or any job board.
- Reading the user's email (Gmail or other).
- Storing or typing job-site passwords; creating accounts on job sites.
- Any server, backend, or hosted database; any paid service.
- CAPTCHA solving or bot-detection workarounds.
- A mobile app.

---

## Start signal

You now have the complete specification (PART 1, PART 2, PART 3).

1. Make sure all three parts are saved verbatim in `docs/spec/`.
2. Create `docs/REQUIREMENTS.md` from all three parts (PART 1, section 0, rule 2).
3. Start **Phase 0**. Work through the phases in order, keep `docs/PROGRESS.md` current, commit at the end of each phase, and ask the user only when you are truly blocked.

END OF PART 3 of 3.
