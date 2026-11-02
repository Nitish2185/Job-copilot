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
