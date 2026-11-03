# Architecture

Job Copilot has no server. Three pieces work together:

```
+------------------------------- GitHub (free) --------------------------------+
| Actions (cron every 6h): Go crawler -> public ATS APIs -> tag skills          |
|   -> write feed (snapshot + daily deltas) -> commit state to `data` branch    |
|   -> deploy GitHub Pages: website + /feed/*.json                              |
+-------------------------------------------------------------------------------+
                 | HTTPS GET (index.json, snapshot.json, new daily files)
                 v
+--------------------------- Browser extension (WXT) --------------------------+
| Background service worker: feed sync, personal boards, listing APIs,          |
|   matcher, AI client + scheduler, apply queue, notifications                  |
| IndexedDB (Dexie): profile, projects, jobs, scores, applications, resumes ... |
| chrome.storage: settings + answer bank mirror (sync), API keys (local only)   |
| UI: Dashboard (full tab), side panel, popup, onboarding                       |
| Content scripts: Auto adapters (ATS forms), Assist adapters, search badges    |
+-------------------------------------------------------------------------------+
                 | the user's own key
                 v
     AI provider (Gemini default | Groq | OpenRouter | Ollama | custom)
```

## Packages

- **`shared/`** (TypeScript): constants (`config.ts`), Zod schemas, the skill tagger and text
  parsers, platform URL detection, and the data files (`skills.json`, `locations.json`) and
  golden test cases that the Go crawler also uses. Both languages run the same test cases, so
  their output stays identical.
- **`crawler/`** (Go): fetches public job-board APIs, normalizes jobs into the feed format, diffs
  against the previous run, and writes static JSON. Runs every 6 hours in GitHub Actions.
- **`extension/`** (WXT + React): everything the user sees and every action taken on their behalf.
  Chrome and Edge use Manifest V3; Firefox uses Manifest V2 (WXT's recommendation).
- **`site/`** (Vite + React): the public website, deployed to GitHub Pages together with the feed.

## Key boundaries

- **Submitting is only possible on `AUTO_SUBMIT_HOSTS`** (`shared/src/config.ts`). The single
  submit function checks the tab's hostname against this list right before clicking.
- **All AI calls and shared-data access go through the background service worker**, so rate limits
  and caching are global and every message is validated.
- **Web content and AI output are untrusted data.** Code decides every action.

- **Assist sites are never submitted to.** Their scripts fill, highlight and read; one guarded
  click function refuses anything that submits, advances or navigates there.
- **Permissions stay narrow.** Required hosts are a fixed list (CI fails if every-site access
  appears); LinkedIn, Workday, other AI providers and listing APIs are optional and requested
  when the user turns them on.

Decisions and their reasons are in [DECISIONS.md](DECISIONS.md). Releasing and store listings are
in [PUBLISHING.md](PUBLISHING.md); rebuilding from source in [BUILDING.md](BUILDING.md); manual
checks on real job sites in [QA.md](QA.md).
