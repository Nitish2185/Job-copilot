# Job Copilot

A free, open-source, privacy-first job-hunting assistant for software developers. It is a
browser extension (Chrome, Edge and Firefox) with a companion Go crawler. It finds jobs, ranks
them against your skills, prepares tailored applications, applies automatically where that is
allowed, and fills forms for you everywhere else. Everything runs on your device.

**Website:** https://nitish2185.github.io/Job-copilot/ · **License:** [MIT](LICENSE)

<!-- Screenshots: replace these placeholders with images from docs/PUBLISHING.md section 7. -->

| Ranked jobs              | Autofill                 | Tracker                  |
| ------------------------ | ------------------------ | ------------------------ |
| _screenshot coming soon_ | _screenshot coming soon_ | _screenshot coming soon_ |

## Features

- **Find jobs**
  - A shared feed, rebuilt every 6 hours from public company job boards (Greenhouse, Lever,
    Ashby, SmartRecruiters, Workable).
  - Your own list of companies (paste a careers link).
  - Optional Adzuna and JSearch searches with your own keys.
  - Save a job from any page you are viewing, or paste a description.
  - On Naukri, Indeed and LinkedIn, match badges on the search results you already loaded.
  - Search links that open Naukri, Indeed and LinkedIn searches for your roles.
  - Duplicates from different sources become one job ("Also listed on ...").
- **Rank them**
  - A free local keyword match works without any setup.
  - With your own AI key (Gemini's free tier by default; Groq, OpenRouter, Ollama or any
    OpenAI-compatible endpoint also work), each description is read and explained: fit,
    reasons, missing skills.
  - "Learn next" shows the skills your best matches ask for.
- **Prepare applications**
  - Your profile, filled in from your resume and optionally your GitHub projects.
  - A bank of saved answers that grows as you apply.
  - A resume tailored to each job that never invents skills, numbers, employers or
    certificates (checked in code), with the PDF made locally.
  - Cover letters and interview prep.
- **Apply**
  - **Assist** everywhere (Naukri, Indeed, LinkedIn, Workday and any other site): press Autofill
    (Alt+Shift+F), check the highlighted fields, and submit yourself. Job Copilot never clicks
    Submit, Next or Continue there.
  - **Auto** only on the public application forms of Greenhouse, Lever, Ashby, Workable and
    SmartRecruiters. It is off by default and every application waits for your approval by
    default. It has daily limits and a dry run, and it stops for CAPTCHAs, unknown questions and
    anything sensitive.
- **Track**
  - A Kanban board and list, with the exact resume and answers sent for each application.
  - Notes, contacts and interview dates.
  - Follow-up reminders and AI follow-up email drafts (you send them).
  - A daily digest and charts of what is working.
- **Your data**
  - Export, import and "Delete everything".
  - Settings and non-sensitive saved answers sync through your browser account.
  - API keys never leave the device.

## Install

From a release (until the store listings are live):

1. Download `job-copilot-<version>-chrome.zip` from the
   [latest release](https://github.com/Nitish2185/Job-copilot/releases/latest) and unzip it into
   a folder you keep.
2. Open `chrome://extensions` (or `edge://extensions`), turn on **Developer mode**, click
   **Load unpacked** and choose the folder.
3. Follow the setup page: upload your resume, answer the "ask once" questions, and optionally add
   a free Gemini key ([how](https://nitish2185.github.io/Job-copilot/#/gemini-key)).

Firefox (140 or later): load `job-copilot-<version>-firefox.zip` from
`about:debugging#/runtime/this-firefox` → **Load Temporary Add-on**. Store links are on the
[website](https://nitish2185.github.io/Job-copilot/#/install) once published.

## Development

### Prerequisites

- Node.js 22 or newer
- pnpm (the version in `package.json` → `packageManager`)
- Go (the version in `crawler/go.mod`)
- Git

### Commands

```sh
pnpm install          # install everything
pnpm dev              # open Chrome with the extension loaded (hot reload)
pnpm test             # unit tests (TypeScript + scripts)
pnpm test:go          # crawler tests
pnpm e2e              # end-to-end tests (Playwright, Chromium with the extension)
pnpm lint             # ESLint
pnpm typecheck        # TypeScript
pnpm format           # Prettier
pnpm build            # production builds (Chrome/Edge and Firefox)
```

For Edge or Firefox during development: `pnpm --filter @job-copilot/extension dev:edge` or
`dev:firefox`. Development builds have **Settings > Demo data** to fill every screen with
fictional jobs and applications. Building from the sources zip is described in
[docs/BUILDING.md](docs/BUILDING.md).

Tests never contact real job sites and never submit anything: forms are local fixtures, and the
auto-apply test host exists only in end-to-end test builds (CI checks that release builds do not
contain it).

### Architecture

There is no server. Three pieces work together:

- **`crawler/`** (Go) runs every 6 hours in GitHub Actions. It reads public job-board APIs,
  normalizes and tags the jobs, and publishes a static feed to GitHub Pages.
- **`extension/`** (WXT, React, Tailwind, Dexie) is everything the user sees and every action
  taken for them:
  - A background service worker runs syncs, matching, the AI scheduler, the auto-apply queue
    and notifications.
  - IndexedDB holds the data.
  - The UI is a dashboard, a side panel and a popup.
  - Content scripts for application forms and job sites keep the UI on those pages in Shadow
    DOM.
- **`site/`** (Vite, React) is the website, deployed to Pages together with the feed.
- **`shared/`** holds the schemas, the skill tagger, the parsers and the data files. The Go
  crawler runs the same golden test cases, so both produce identical results.

More in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The reasons behind choices are in
[docs/DECISIONS.md](docs/DECISIONS.md), and every permission is explained in
[docs/PERMISSIONS.md](docs/PERMISSIONS.md).

| Folder       | What it is                                                        |
| ------------ | ----------------------------------------------------------------- |
| `extension/` | The browser extension                                             |
| `shared/`    | Code and data shared by the extension, website and crawler        |
| `crawler/`   | Go crawler that builds the shared job feed                        |
| `site/`      | Website and feed host (GitHub Pages)                              |
| `scripts/`   | Repository scripts (set-owner, icons, release checks)             |
| `docs/`      | Architecture, decisions, permissions, publishing, QA and progress |

## Steps only the repository owner can do

1. **Turn on GitHub Pages:** repository **Settings → Pages → Build and deployment → Source:
   GitHub Actions**.
2. **Let workflows write:** **Settings → Actions → General → Workflow permissions → Read and
   write permissions**, then **Save**.
3. **Run the crawl once:** **Actions → Crawl jobs → Run workflow**. After it succeeds, the
   website and the shared feed are live; it then runs every 6 hours by itself.
4. **Try it yourself:** get a Gemini key, load the extension (see Install), and complete
   onboarding. [docs/QA.md](docs/QA.md) is a checklist for Naukri, Indeed, LinkedIn and Workday
   with your own accounts.
5. **Release and publish:** push a `v<version>` tag to build a release, then follow
   [docs/PUBLISHING.md](docs/PUBLISHING.md) for Edge Add-ons and Firefox Add-ons (both free).

### Forking

Point everything at your own GitHub account and repository in one step:

```sh
pnpm run set-owner <github-user> <repo-name>
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for adding a company to the shared feed, adding a skill,
adding a site adapter and fixing a broken one.
