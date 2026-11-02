# Job Copilot

A free, open-source, privacy-first job-hunting assistant for software developers.
It is a browser extension (Chrome, Edge, Firefox) with a companion Go crawler. It finds jobs,
ranks them against your skills, prepares tailored applications, applies automatically where
that is allowed, and fills forms for you everywhere else.

> **Status: early development.** The project is being built in phases; nothing is ready to
> install yet. See [docs/PROGRESS.md](docs/PROGRESS.md) for where things stand.

## What it will do

- **Find jobs** from a shared feed of public company job boards (Greenhouse, Lever, Ashby,
  SmartRecruiters), your own list of companies, optional job APIs with your own keys, pages you
  save while browsing, and descriptions you paste.
- **Rank jobs** with a free local keyword match, then optional AI scoring with reasons and
  missing skills.
- **Prepare applications** from your profile and a growing bank of saved answers, with an
  optional resume tailored to each job (it never invents facts) and a cover letter.
- **Apply**
  - **Auto mode** only on public company application forms (Greenhouse, Lever, Ashby, Workable,
    SmartRecruiters). Off by default.
  - **Assist mode** everywhere else (Naukri, Indeed, LinkedIn, Workday, and any other site): it
    fills the form, and **you** click submit.
- **Track** every application, with the exact resume and answers sent, reminders and analytics.

## Privacy

- No servers. Everything runs on your device.
- Your data stays in the extension's local storage.
- AI is optional and uses your own free key (Google Gemini by default). Only the text needed for a
  task is sent, with contact details removed.

## Development

### Prerequisites

- Node.js 22 or newer
- pnpm (the version in `package.json` → `packageManager`)
- Go (the version in `crawler/go.mod`; older Go installs download it automatically)
- Git

### Commands

```sh
pnpm install          # install everything
pnpm dev              # open Chrome with the extension loaded (hot reload)
pnpm test             # unit tests (TypeScript + scripts)
pnpm test:go          # crawler tests
pnpm lint             # ESLint
pnpm typecheck        # TypeScript
pnpm format           # Prettier
pnpm build            # production builds
```

For Edge or Firefox during development: `pnpm --filter @job-copilot/extension dev:edge` or
`dev:firefox`.

### Project layout

| Folder       | What it is                                                      |
| ------------ | --------------------------------------------------------------- |
| `extension/` | The browser extension (WXT, React, Tailwind)                    |
| `shared/`    | Code and data shared by the extension, website and crawler      |
| `crawler/`   | Go crawler that builds the shared job feed                      |
| `site/`      | Static website and feed host (GitHub Pages)                     |
| `docs/`      | Architecture, decisions, permissions, progress and requirements |

### Forking

Point everything at your own GitHub account and repository in one step:

```sh
pnpm run set-owner <github-user> <repo-name>
```

## License

[MIT](LICENSE)
