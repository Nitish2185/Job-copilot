# Publishing Job Copilot

Step-by-step instructions for releasing Job Copilot and listing it in the free browser stores.
Every step here is done by the repository owner; nothing is published automatically except the
GitHub release.

Links used below:

- Website: https://nitish2185.github.io/Job-copilot/
- Privacy policy: https://nitish2185.github.io/Job-copilot/#/privacy
- Permissions explained: [docs/PERMISSIONS.md](PERMISSIONS.md)
- Building from source: [docs/BUILDING.md](BUILDING.md)

## 1. Make a release (GitHub)

1. Set the new version in `extension/package.json` (for example `"version": "1.0.0"`), commit
   and push to `main`, and wait for CI to pass.
2. Tag that commit and push the tag:

   ```sh
   git tag v1.0.0
   git push origin v1.0.0
   ```

3. The **Release** workflow checks that the tag matches the version, runs the checks, and
   publishes a GitHub release with:
   - `job-copilot-1.0.0-chrome.zip` for Chrome and Edge
   - `job-copilot-1.0.0-firefox.zip` for Firefox
   - `job-copilot-1.0.0-sources.zip` for Firefox reviewers
   - `SHA256SUMS.txt`

Use these files for every store below. Stores refuse a version number they have already seen,
so bump the version for every upload.

## 2. Chrome users (no store needed)

Point people to the website's Install page. In short: download the `chrome.zip` from the latest
release, unzip it into a folder they keep, open `chrome://extensions`, turn on **Developer
mode**, click **Load unpacked** and choose the folder. Chrome shows a notice about
developer-mode extensions on start-up; that is expected for extensions loaded this way.

## 3. Microsoft Edge Add-ons (free)

1. Register as a developer in [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/overview)
   (free; an individual account is enough).
2. **Create new extension** and upload `job-copilot-<version>-chrome.zip` (Edge uses the same
   build as Chrome).
3. **Availability:** public; all markets.
4. **Properties:** category _Productivity_; privacy policy URL as above; website URL as above;
   support: `https://github.com/Nitish2185/Job-copilot/issues`.
5. **Store listing:** paste the texts from section 6 and add the screenshots from section 7.
6. **Submit.** Reviews usually take a few business days. Answer reviewer questions with the
   permission justifications in section 6.

## 4. Firefox Add-ons (AMO, free)

1. Sign in at [addons.mozilla.org/developers](https://addons.mozilla.org/developers/) with a
   Firefox account.
2. **Submit a New Add-on** → **On this site** (listed on AMO).
3. Upload `job-copilot-<version>-firefox.zip`. The validator should report no errors (CI runs
   the same linter; its remaining warnings come from bundled libraries and are explained in
   section 6).
4. When asked whether the add-on uses code generators, minifiers or bundlers, answer **Yes** and
   upload `job-copilot-<version>-sources.zip`. In the notes to reviewers, write:
   "Build steps are in docs/BUILDING.md inside the sources zip: `pnpm install
--frozen-lockfile` then `pnpm --filter @job-copilot/extension build:firefox`. The output in
   extension/.output/firefox-mv2 is identical to the uploaded package."
5. **Data collection:** the manifest declares no required data collection, and optional
   _personally identifying information_ and _website content_, sent only to the AI provider the
   user picks, when they turn AI on. Describe it the same way in the listing.
6. Fill in the listing (section 6), choose the _MIT_ license, add the privacy policy URL and
   screenshots, and submit. Listed add-ons are reviewed by Mozilla; small updates are often
   approved quickly, the first submission may take longer.

## 5. Chrome Web Store (optional, later)

Listing in the Chrome Web Store needs a one-time US$5 developer registration. When you want
it: register at the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole),
upload the same `chrome.zip`, and use the texts in section 6. The store asks for a single
purpose statement, a justification for each permission, and data-use disclosures; all are
below. Until then, the load-unpacked steps above work.

## 6. Listing texts

**Name:** Job Copilot

**Short description** (132 characters or fewer):

> Free, private job-hunting assistant for developers: finds and ranks jobs, prepares
> applications, and fills forms.

**Long description:**

> Job Copilot helps software developers find and apply to jobs without giving their data away.
>
> - Finds jobs from hundreds of company career pages (a shared feed updated every few hours),
>   companies you add, optional Adzuna and JSearch searches with your own keys, pages you save
>   and descriptions you paste.
> - Ranks every job against your profile with a free local match, and optionally with your own
>   AI key (Google Gemini's free tier works).
> - Prepares applications: a resume tailored to the job that never invents skills or numbers,
>   a cover letter, and answers to common questions from your profile and saved answers.
> - Fills application forms when you press Autofill. On Naukri, Indeed, LinkedIn, Workday and
>   every other site it only fills; you review and submit. Automatic applying is limited to the
>   public forms of Greenhouse, Lever, Ashby, Workable and SmartRecruiters, is off by default,
>   and asks for your approval.
> - Tracks your applications on a board, reminds you to follow up, and shows what is working.
>
> No account, no server, no tracking. Your data stays in your browser. Free and open source
> (MIT).

**Category:** Productivity (Edge, Chrome); _Other_ or _Productivity_ on AMO.

**Single purpose** (Chrome): Help the user find, prepare and track job applications, and fill
application forms they open.

**Remote code:** None. All code is in the package; nothing is downloaded and run.

**Data use:** No data is sold or shared with the developer. Profile text and job page text are
sent only to the AI provider the user configures, with their own key, when they use AI
features. Application answers are entered into employer forms the user opens or approves.

**Permission justifications** (full list in [PERMISSIONS.md](PERMISSIONS.md)):

| Permission                        | Justification                                                                                                               |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| storage, unlimitedStorage         | Profile, resumes (PDF files), jobs and applications are stored locally; thousands of jobs exceed the default quota.         |
| alarms                            | Feed and board sync every 6 hours, the auto-apply queue, the daily digest and daily cleanup.                                |
| scripting, activeTab              | Fill the form on the page the user is viewing, only when they press Autofill or use the right-click menu.                   |
| contextMenus                      | "Autofill this form", "Save this job" and "Score this job" in the right-click menu.                                         |
| notifications                     | Daily digest, applications that need the user, follow-up reminders.                                                         |
| sidePanel                         | The job card, Autofill button and saved answers beside the page.                                                            |
| Job board API hosts               | Read public job listings for companies the user adds (Greenhouse, Lever, Ashby, SmartRecruiters, Workable).                 |
| Application form hosts            | Fill, and when the user enabled and approved it, submit applications on those five public form hosts only.                  |
| naukri.com, indeed.com            | Show match badges on search results already loaded, read the job the user opened, and fill forms when asked. Never submits. |
| generativelanguage.googleapis.com | The default AI provider (Gemini) with the user's own key.                                                                   |
| api.github.com                    | Import the user's public projects into their profile, when asked.                                                           |
| nitish2185.github.io              | Download the shared job feed.                                                                                               |
| Optional hosts                    | LinkedIn, Workday, other AI providers, Adzuna and JSearch, each requested only when the user turns that feature on.         |

**About validator warnings (Firefox):** the remaining warnings point at bundled libraries: Zod
checks whether `Function` is available (the check fails safely under the extension's content
security policy), PDF.js loads its own worker module, and the page badges set static HTML
templates (any text from a page is set with `textContent`).

## 7. Screenshots checklist

Take them from a test profile, never real personal data ("Load demo data" in a development
build fills every screen). Recommended size 1280 × 800.

- [ ] Jobs list with scores and filters
- [ ] A job page with the fit breakdown and missing skills
- [ ] The tailored resume preview
- [ ] Autofill on an application form with the highlights and panel
- [ ] The side panel on a job page
- [ ] The tracker board
- [ ] Analytics
- [ ] Settings > Auto-apply (to show it is off by default)

Use the same images on the website's Home page placeholders.
