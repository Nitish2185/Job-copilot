# Progress

## Current phase

**Phase 0 - Setup** (in progress)

## Done

- Prerequisites checked: Node 24.19, pnpm 12.16, Git 2.55, Go 1.24.0 locally with 1.27.3 via toolchain switching. Chrome and Edge installed; Firefox not yet (install before Phase 11).
- `.gitignore`, `.gitattributes`, spec copied to `docs/spec/`.
- `docs/REQUIREMENTS.md`, `docs/DECISIONS.md`, this file.

## Next

- pnpm workspace + root tooling (TypeScript, ESLint, Prettier, Vitest).
- `shared` package with `config.ts`.
- WXT extension (React + Tailwind) with an empty dashboard page.
- Go module skeleton with subcommand stubs.
- `ci.yml`, `set-owner` script, docs skeleton, LICENSE.

## Known issues

- None yet.

## How to continue

Read this file, then `docs/DECISIONS.md`, then the spec section for the current phase in `docs/spec/`. Tick items in `docs/REQUIREMENTS.md` as they land.
