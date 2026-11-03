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

### Add a company to the shared feed

The feed covers companies whose jobs are on Greenhouse, Lever, Ashby, SmartRecruiters or
Workable.

1. Find the company's careers page and run:

   ```sh
   cd crawler
   go run ./cmd/crawl discover https://careers.example.com/jobs
   ```

   It prints a ready-to-paste entry and how many jobs the board lists.

2. Add the entry to `crawler/companies.json` (one company per line, sorted by platform and
   name). Set `region` to the ISO-2 country codes where most of its developer jobs are, plus
   `"REMOTE"` if many are remote.

3. Check it, and the rest of the list:

   ```sh
   go run ./cmd/crawl validate-companies
   ```

   `--fix` removes boards that are gone (404) or list no jobs.

The crawler keeps only developer roles in the feed (engineering, data, QA, security, DevOps and
similar titles, or titles that name a known skill).

### Add a skill

1. Add an entry to `shared/data/skills.json`: `id` (lowercase, hyphens), `display`,
   `category`, and lowercase `aliases`. If the short name is an ordinary word (like "Go" or
   "Spring"), set `"ambiguous": true`, list only unambiguous aliases, and add
   `contextPatterns` such as `"go developer"` or `"java/spring"`.
2. Add cases to `shared/testcases/skills.cases.json`, including text where the word must
   **not** count as the skill.
3. Run `pnpm test` and `pnpm test:go`: the TypeScript and Go taggers must both pass.

### Fix a broken site adapter

Job sites change their markup. Every site's selectors are in one place:

- Assist sites (Naukri, Indeed, LinkedIn, Workday): the `SELECTORS` map in
  `extension/lib/apply/adapters/assist.ts`.
- Auto sites (Greenhouse, Lever, Ashby, Workable, SmartRecruiters): the `SELECTORS` map in
  `extension/lib/apply/adapters/auto.ts`.

1. Get the page: a "Report a broken page" issue lists the page type and the fields Job Copilot
   found. For the markup, save the page with Ctrl+S into `captures/<site>/` (git-ignored: saved
   pages hold personal data and are never committed).
2. Prefer stable hooks in this order: `data-*` attributes and ARIA roles or labels, ids, visible
   text, and class names last (sites rename classes often). Partial class matches such as
   `[class*='jd-header-title']` survive build hashes.
3. Add a small fixture to the adapter's tests (`extension/tests/unit/assist-adapters.test.ts` or
   `apply-adapters.test.ts`) with only the structure that matters, using fictional names and
   values. Never paste a real page with personal data into a test.
4. Run `pnpm test`, then try the real site with `docs/QA.md`.

### Add a site adapter

1. Decide the mode. Only hosts in `AUTO_SUBMIT_HOSTS` (`shared/src/config.ts`) may ever be Auto;
   adding one is a deliberate change that needs a public, stable application form. Everything
   else is Assist.
2. Map the hostname to the adapter in `extension/lib/apply/mode.ts` and add a test for
   look-alike hosts in `apply-mode.test.ts`.
3. Add a `SELECTORS` entry and the adapter in `assist.ts` (or `auto.ts`). Assist adapters never
   implement `findSubmitControl`.
4. To run on the site, add its origin either to the Assist site script's matches and the
   required hosts in `wxt.config.ts` (and explain it in `docs/PERMISSIONS.md`), or, for a site
   most users do not need, as an optional site in `extension/lib/apply/optionalSites.ts` (with
   its origins in `OPTIONAL_HOSTS` in `wxt.config.ts`).
5. Add fixture tests and a section to `docs/QA.md`.
