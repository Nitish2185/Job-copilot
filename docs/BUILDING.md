# Building Job Copilot from source

These steps rebuild the exact extension files from the sources zip (for Firefox Add-ons
reviewers and anyone who wants to check a release).

## Requirements

- Node.js 22 or later (releases are built with Node.js 24).
- pnpm 12.16.1: `npm install --global pnpm@12.16.1` (or `corepack enable`, which reads the
  version from `package.json`).
- Any operating system (Windows, macOS or Linux).

## Steps

From the folder that contains `pnpm-workspace.yaml`:

```sh
pnpm install --frozen-lockfile
pnpm --filter @job-copilot/extension build:firefox
```

The Firefox build is written to `extension/.output/firefox-mv2/`. For Chrome and Edge, run
`pnpm --filter @job-copilot/extension build:chrome` instead (output in
`extension/.output/chrome-mv3/`).

To make the same zip files a release contains:

```sh
pnpm --filter @job-copilot/extension zip           # Chrome and Edge
pnpm --filter @job-copilot/extension zip:firefox   # Firefox, plus this sources zip
```

## What the build does

WXT bundles the TypeScript and React code in `extension/` and the shared package in `shared/`
with Vite. No code is downloaded at run time, and the bundles are not minified beyond Vite's
defaults. Fonts and icons in `extension/public/` are copied as they are. `site/` (the website)
is included only because the workspace lists it; the extension does not use it.
