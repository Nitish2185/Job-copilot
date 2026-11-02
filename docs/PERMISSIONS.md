# Permissions

Every permission the extension requests and why. Store reviewers read this; keep it current.

## Requested today

| Permission / host                                                                                                                                                                             | Why                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`                                                                                                                                                                                     | Settings (synced), secrets and small flags (this device only).                                                                                 |
| `unlimitedStorage`                                                                                                                                                                            | Thousands of jobs, resumes and files live in IndexedDB on the device.                                                                          |
| `alarms`                                                                                                                                                                                      | Feed sync and personal-board sync every 6 hours, even after the service worker sleeps; later also queue ticks, digest, follow-ups and cleanup. |
| `https://boards-api.greenhouse.io/*`, `https://api.lever.co/*`, `https://api.eu.lever.co/*`, `https://api.ashbyhq.com/*`, `https://api.smartrecruiters.com/*`, `https://apply.workable.com/*` | Read the public job lists of companies the user adds (personal boards). GET requests only.                                                     |
| Feed origin (`https://<owner>.github.io/*`)                                                                                                                                                   | Download the shared job feed.                                                                                                                  |

Opening the dashboard on install and from the toolbar button (`tabs.create`) needs no permission.
End-to-end test builds (`JOB_COPILOT_E2E=1`) add `http://localhost/*` and `http://127.0.0.1/*` for local
fixture servers; release builds never include them.

## Planned

These will be added as the features that need them land. Each row moves to the table above
when it ships.

| Permission / host                                                                    | Why                                                                                 |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `notifications`                                                                      | Daily digest, "needs you" alerts, follow-up reminders.                              |
| `scripting`, `activeTab`                                                             | Inject the generic autofill or "save this job" script only when the user asks.      |
| `contextMenus`                                                                       | "Save this job", "Score this job", "Autofill this form".                            |
| `sidePanel` (Chrome/Edge)                                                            | The job side panel. Firefox uses `sidebar_action` instead.                          |
| Auto application hosts (`AUTO_SUBMIT_HOSTS`)                                         | Fill and, when the user enabled it, submit public company application forms.        |
| `api.github.com`                                                                     | Import the user's public projects.                                                  |
| `generativelanguage.googleapis.com`                                                  | Default AI provider (the user's own Gemini key).                                    |
| `https://www.naukri.com/*`, `https://*.indeed.com/*`                                 | Assist mode: fill forms the user opened, show match badges. Never submits.          |
| Optional: LinkedIn, Workday, other AI providers, Ollama, custom URL, Adzuna, JSearch | Requested at runtime only when the user turns the feature on, after an explanation. |

## Never requested

`cookies`, blocking `webRequest`, `debugger`, `history`, `management`, and `<all_urls>` as a
required permission.
