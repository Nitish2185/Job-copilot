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
