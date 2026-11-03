# Manual QA on real job sites

Automated tests never contact real job sites. This checklist is for trying the Assist sites by
hand with your own accounts. Job Copilot never submits on these sites: you always press the
site's Continue, Next and Submit buttons yourself.

**Before you start**

- Load a build: `pnpm --filter @job-copilot/extension build`, then load
  `extension/.output/chrome-mv3` as an unpacked extension (or `firefox-mv2` as a temporary
  add-on).
- Finish onboarding with your profile, the "ask once" answers and a resume.
- Have a job you are happy to really apply to, or stop before the final Submit.
- If something does not work, use **Report a broken page** in the side panel (or save the page
  with Ctrl+S into `captures/<site>/`, which is never committed) and note what you expected.

Tick each box when it works. Write the date and the browser at the top of your notes.

## Every site

- [ ] Badges appear on search results within a second or two, and new ones appear as you
      scroll or change pages. Nothing is clicked or loaded by Job Copilot.
- [ ] A badge's **Save** button saves the job without opening it. The job shows in Matches.
- [ ] **AI-score jobs on this page** scores up to 10 cards (with an AI key), and their badges
      change from `NN~` to `NN`.
- [ ] Right-click a job page > **Save this job to Job Copilot**: a notification names the job.
      **Score this job** shows its score.
- [ ] While logged out, pressing Autofill (Alt+Shift+F) shows the banner "You're logged out of
      <site>. Please log in, then press Autofill again." and fills nothing.
- [ ] Logged in, Autofill fills the step, highlights fields (green = profile, blue = AI,
      yellow = needs you) and lists them in the floating panel. **Undo autofill** clears them.
- [ ] With **Autofill each new step automatically** on (Settings > Assist sites), pressing
      Continue fills the next step by itself, only in the tab you are looking at.
- [ ] Switching to another tab while a step loads does not fill it until you come back.
- [ ] After you submit, the side panel shows "You applied to this job" (confirmation found) or
      asks **Did you submit this application?**
- [ ] **Report a broken page** opens a GitHub issue with field names and the page type only, no
      answers, names, emails or phone numbers.

## Naukri

- [ ] Search page (for example `https://www.naukri.com/react-jobs-in-pune`): badges on cards.
- [ ] Job page: the side panel shows the match; **Save this job** reads the title, company,
      location, skills and description.
- [ ] The "Tailored resume" option is disabled with the Naukri explanation.
- [ ] Apply with your Naukri profile resume. Recruiter questions in the chat panel: free-text
      answers are filled; for option chips the suggested chip has a green outline and a "Click it
      yourself" tooltip, and **is not clicked**. You press send.
- [ ] Notice period and CTC answers use your saved answers (LPA format).
- [ ] After applying, Naukri's "Applied" message records the application once (applying again
      does not create a second one).
- [ ] "Apply on company site" to a Greenhouse, Lever, Ashby, Workable or SmartRecruiters form:
      the side panel offers **Apply automatically via <platform>**; confirming only queues the
      employer's form (auto-apply must be on).

## Indeed

- [ ] Search page on your country's subdomain (for example `https://in.indeed.com/jobs?q=react`):
      badges on cards, also in the right-hand job pane.
- [ ] Job page: **Save this job** reads the details.
- [ ] Indeed Apply: contact info, resume (if an upload field is shown, Autofill attaches your
      chosen PDF), employer questions and review steps are filled one by one; you press Continue
      and Submit. Note the apply page's address (it may be on another subdomain).
- [ ] The "Your application has been submitted" page records the application.
- [ ] "Apply on company site" links behave as on Naukri.

## LinkedIn (optional)

- [ ] Settings > Assist sites > **Turn on LinkedIn** shows the explanation first; **Allow
      LinkedIn** opens the browser's permission prompt. After allowing, reload LinkedIn.
- [ ] Turn on LinkedIn badges in the same section: badges on job search lists.
- [ ] Job view: **Save this job** works.
- [ ] Easy Apply: each step is filled when you press Autofill (and each new step when that
      setting is on); you click Next, Review and Submit.
- [ ] External apply links to Auto hosts offer **Apply automatically via <platform>**.
- [ ] **Turn off LinkedIn** removes the permission; after a reload nothing runs on LinkedIn.

## Workday (optional)

- [ ] **Turn on Workday** with the explanation and the permission prompt.
- [ ] Sign in or create the company account yourself (Job Copilot never fills login forms).
- [ ] My Information, My Experience, Application Questions, Voluntary Disclosures and Self
      Identify are filled; disclosure questions are declined unless your profile has answers.
- [ ] You click Save and Continue and Submit; the submitted message records the application.

## Any other site

- [ ] Right-click > **Autofill this form with Job Copilot** fills a form on any site (for
      example a company's own careers page) and never clicks its buttons.
- [ ] **Save this job** works on pages with job data (most company career sites), and with an AI
      key it also works on plain pages.
