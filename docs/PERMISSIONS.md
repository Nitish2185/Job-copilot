# Permissions

Every permission the extension requests and why. Store reviewers read this; keep it current.

## Requested today

| Permission | Why                      |
| ---------- | ------------------------ |
| _(none)_   | The scaffold needs none. |

The toolbar button and opening the dashboard on install (`tabs.create`) need no permission.

## Planned

These will be added as the features that need them land. Each row moves to the table above
when it ships.

| Permission / host                                                                    | Why                                                                                     |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `storage`, `unlimitedStorage`                                                        | Profile, jobs, resumes and settings live on the device; job lists can exceed the quota. |
| `alarms`                                                                             | Feed sync every 6 hours, queue ticks, daily digest, follow-ups, cleanup.                |
| `notifications`                                                                      | Daily digest, "needs you" alerts, follow-up reminders.                                  |
| `scripting`, `activeTab`                                                             | Inject the generic autofill or "save this job" script only when the user asks.          |
| `contextMenus`                                                                       | "Save this job", "Score this job", "Autofill this form".                                |
| `sidePanel` (Chrome/Edge)                                                            | The job side panel. Firefox uses `sidebar_action` instead.                              |
| Auto application hosts (`AUTO_SUBMIT_HOSTS`)                                         | Fill and, when the user enabled it, submit public company application forms.            |
| ATS API hosts (Greenhouse, Lever, Ashby, SmartRecruiters)                            | Fetch personal company boards and job descriptions on demand.                           |
| Feed origin (GitHub Pages)                                                           | Download the shared job feed.                                                           |
| `api.github.com`                                                                     | Import the user's public projects.                                                      |
| `generativelanguage.googleapis.com`                                                  | Default AI provider (the user's own Gemini key).                                        |
| `https://www.naukri.com/*`, `https://*.indeed.com/*`                                 | Assist mode: fill forms the user opened, show match badges. Never submits.              |
| Optional: LinkedIn, Workday, other AI providers, Ollama, custom URL, Adzuna, JSearch | Requested at runtime only when the user turns the feature on, after an explanation.     |

## Never requested

`cookies`, blocking `webRequest`, `debugger`, `history`, `management`, and `<all_urls>` as a
required permission.
