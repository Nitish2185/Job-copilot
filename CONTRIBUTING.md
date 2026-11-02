# Contributing

Thanks for helping! This guide covers setup and the common kinds of change.

## Setup

See [README.md](README.md#development) for prerequisites and commands. Before opening a pull
request, run:

```sh
pnpm format && pnpm lint && pnpm typecheck && pnpm test && pnpm test:go
```

## Ground rules

- **Never** add code that submits, advances or navigates on Assist sites (Naukri, Indeed,
  LinkedIn, Workday, and every site not in `AUTO_SUBMIT_HOSTS`). Assist mode only fills fields.
- **Never** add CAPTCHA solving, login automation, password storage, or anything that disguises
  automation as a human.
- Tests never contact real job sites, never submit anything real, and never use real personal
  data. Use the local fixtures.
- TypeScript is `strict`; avoid `any` except at validated boundaries.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat(crawler): ...`, `fix(extension): ...`, `docs: ...`).

## Common changes

These sections are filled in as the features land:

- **Add a company to the shared feed** - coming with the crawler.
- **Add a skill** - coming with the skill dictionary.
- **Add a site adapter** - coming with the apply engine.
- **Fix a broken adapter** - coming with the apply engine.
