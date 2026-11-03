import { APP_NAME, REPO_URL } from "@job-copilot/shared/config";
import type { ReactNode } from "react";

function H1({ children }: { children: ReactNode }) {
  return <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{children}</h1>;
}

function H2({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="mt-10 text-xl font-semibold">
      {children}
    </h2>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p className="mt-3 leading-relaxed text-slate-700 dark:text-slate-300">{children}</p>;
}

function Steps({ children }: { children: ReactNode }) {
  return (
    <ol className="mt-3 list-decimal space-y-2 pl-6 text-slate-700 dark:text-slate-300">
      {children}
    </ol>
  );
}

function Bullets({ children }: { children: ReactNode }) {
  return (
    <ul className="mt-3 list-disc space-y-2 pl-6 text-slate-700 dark:text-slate-300">{children}</ul>
  );
}

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm dark:bg-slate-800">{children}</code>
  );
}

function A({ href, children }: { href: string; children: ReactNode }) {
  const external = href.startsWith("http");
  return (
    <a
      href={href}
      className="font-medium text-blue-700 underline dark:text-blue-400"
      {...(external && { target: "_blank", rel: "noreferrer" })}
    >
      {children}
    </a>
  );
}

function Placeholder({ label }: { label: string }) {
  return (
    <div
      role="img"
      aria-label={`${label} (screenshot coming soon)`}
      className="flex aspect-video items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900"
    >
      {label}: screenshot coming soon
    </div>
  );
}

const AUTO_SITES = "Greenhouse, Lever, Ashby, Workable and SmartRecruiters";

export function HomePage() {
  return (
    <>
      <H1>Find, rank and apply to developer jobs, without giving your data away.</H1>
      <P>
        {APP_NAME} is a free, open-source browser extension for software developers. It gathers jobs
        from hundreds of company career pages, ranks them against your profile, prepares a resume
        and cover letter for each one, fills application forms, and tracks where you applied.
        Everything stays in your browser.
      </P>
      <div className="mt-6 flex flex-wrap gap-3">
        <a
          href="#/install"
          className="rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
        >
          Install {APP_NAME}
        </a>
        <a
          href={REPO_URL}
          className="rounded-md border border-slate-300 px-4 py-2 font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
        >
          View the source
        </a>
      </div>

      <H2>What it does</H2>
      <Bullets>
        <li>
          <strong>Finds jobs:</strong> a shared feed, updated every few hours from public company
          job boards, plus any company you add. On Naukri, Indeed and LinkedIn it scores the results
          you are already looking at.
        </li>
        <li>
          <strong>Ranks them:</strong> a free keyword match works without any setup; with your own
          free AI key it also reads each description and explains the fit and the gaps.
        </li>
        <li>
          <strong>Prepares applications:</strong> a resume tailored to the job (it never invents
          skills, numbers or employers), a cover letter, and answers to the usual questions from
          your profile and saved answers.
        </li>
        <li>
          <strong>Fills forms:</strong> press Autofill (Alt+Shift+F) on an application form and
          check what it filled. Green came from your profile, blue from the AI, yellow needs you.
        </li>
        <li>
          <strong>Tracks everything:</strong> a board from Applied to Offer, follow-up reminders,
          and charts that show what is working.
        </li>
      </Bullets>

      <H2>Two ways to apply: Auto and Assist</H2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 p-5 dark:border-slate-800">
          <h3 className="font-semibold">Assist (everywhere)</h3>
          <P>
            On Naukri, Indeed, LinkedIn, Workday and every other site, {APP_NAME} only fills the
            form you opened. You review it and press Continue and Submit yourself. It never clicks
            those buttons for you.
          </P>
        </div>
        <div className="rounded-lg border border-slate-200 p-5 dark:border-slate-800">
          <h3 className="font-semibold">Auto (opt-in, a few sites only)</h3>
          <P>
            On the public application forms of {AUTO_SITES}, you can let {APP_NAME} apply for you.
            It is off until you turn it on, asks for your approval by default, has daily limits, and
            stops for CAPTCHAs, unknown questions and anything sensitive.
          </P>
        </div>
      </div>

      <H2>Private by design</H2>
      <Bullets>
        <li>
          No account, no server, no tracking. Your profile, resumes and applications live in your
          browser.
        </li>
        <li>
          AI is optional and uses your own key with the provider you pick. Contact details are
          removed before anything is sent.
        </li>
        <li>It never asks for or types your job-site passwords, and never solves CAPTCHAs.</li>
      </Bullets>

      <H2>Screenshots</H2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Placeholder label="Ranked jobs" />
        <Placeholder label="Autofill on an application form" />
        <Placeholder label="Tailored resume" />
        <Placeholder label="Application tracker" />
      </div>
    </>
  );
}

export function InstallPage() {
  return (
    <>
      <H1>Install {APP_NAME}</H1>
      <H2>From a browser store</H2>
      <P>
        Store listings for Chrome, Edge and Firefox are on the way. Until then, install it from the
        latest release as shown below.
      </P>
      <Bullets>
        <li>Chrome Web Store: coming soon</li>
        <li>Microsoft Edge Add-ons: coming soon</li>
        <li>Firefox Add-ons: coming soon</li>
      </Bullets>

      <H2>Chrome or Edge, from a release</H2>
      <Steps>
        <li>
          Open the <A href={`${REPO_URL}/releases/latest`}>latest release</A> and download the file
          ending in <Code>chrome.zip</Code>.
        </li>
        <li>Unzip it into a folder you will keep (the browser loads it from there).</li>
        <li>
          Open <Code>chrome://extensions</Code> (or <Code>edge://extensions</Code>) and turn on{" "}
          <strong>Developer mode</strong>.
        </li>
        <li>
          Click <strong>Load unpacked</strong> and choose the unzipped folder.
        </li>
        <li>
          {APP_NAME} opens its setup page. Pin it from the puzzle-piece menu so it is one click
          away.
        </li>
      </Steps>
      <P>
        To update, download the new release, replace the folder&apos;s contents and press the reload
        icon on the extension&apos;s card.
      </P>

      <H2>Firefox, for trying it out</H2>
      <Steps>
        <li>
          Download the file ending in <Code>firefox.zip</Code> from the{" "}
          <A href={`${REPO_URL}/releases/latest`}>latest release</A>.
        </li>
        <li>
          Open <Code>about:debugging#/runtime/this-firefox</Code> and click{" "}
          <strong>Load Temporary Add-on</strong>.
        </li>
        <li>Choose the zip file. Firefox removes temporary add-ons when it closes.</li>
      </Steps>

      <H2>After installing</H2>
      <Steps>
        <li>Upload your resume: {APP_NAME} reads it into a profile you can edit.</li>
        <li>Answer the &quot;ask once&quot; questions (notice period, pay, work authorization).</li>
        <li>
          Optionally add a free AI key (see <A href="#/gemini-key">Get a free Gemini key</A>).
          Everything except the AI extras works without one.
        </li>
      </Steps>
    </>
  );
}

export function GeminiKeyPage() {
  return (
    <>
      <H1>Get a free Gemini key</H1>
      <P>
        {APP_NAME} works without AI. A key adds AI scoring, tailored resumes, cover letters and
        answers to open questions. Google&apos;s Gemini API has a free tier that is enough for
        everyday job hunting.
      </P>
      <Steps>
        <li>
          Open <A href="https://aistudio.google.com/apikey">Google AI Studio</A> and sign in with a
          Google account.
        </li>
        <li>
          Click <strong>Create API key</strong>. Accept the terms if asked, and pick or create a
          project.
        </li>
        <li>Copy the key.</li>
        <li>
          In {APP_NAME}, open <strong>Settings</strong> &gt; <strong>AI provider</strong>, keep
          Gemini selected, paste the key and press <strong>Test</strong>.
        </li>
      </Steps>
      <H2>Good to know</H2>
      <Bullets>
        <li>
          Your key is stored only in this browser. It is never synced and is left out of backups
          unless you choose to include it.
        </li>
        <li>
          On the free tier, Google may use what you send to improve its products. {APP_NAME}
          removes your email, phone number and links before sending anything; you can review this in
          Settings.
        </li>
        <li>
          {APP_NAME} keeps a daily request limit so you stay inside the free quota. You can also use
          Groq, OpenRouter or a local Ollama model instead.
        </li>
      </Bullets>
    </>
  );
}

export function FaqPage() {
  const items: [string, ReactNode][] = [
    [
      "Is this allowed?",
      <>
        {APP_NAME} works like a careful assistant sitting next to you. On most sites it only fills
        the form you opened, and you submit it yourself. Automatic applying is limited to{" "}
        {AUTO_SITES}, whose application forms are public and made for candidates to fill in
        directly; it is off by default, rate-limited, and never gets past a CAPTCHA. You are
        responsible for following each site&apos;s terms, and for everything you submit.
      </>,
    ],
    [
      "Why are Naukri, Indeed and LinkedIn Assist-only?",
      <>
        Their terms restrict bots and automated use, and applying through them happens inside your
        logged-in account. So {APP_NAME} never clicks Apply, Next or Submit there, never searches or
        loads their pages in the background, and never types your password. It fills the step you
        are looking at, shows a match score on results you already loaded, and leaves the rest to
        you.
      </>,
    ],
    [
      "Where is my data?",
      <>
        In your browser&apos;s storage on your computer. There is no {APP_NAME} server or account.
        Settings and your non-sensitive saved answers can sync through your browser account, like
        bookmarks. Export, import and &quot;Delete everything&quot; are in Settings. See the{" "}
        <A href="#/privacy">privacy policy</A>.
      </>,
    ],
    [
      "Does it cost anything?",
      <>
        No. {APP_NAME} is free and open source (MIT), and the shared job feed is built for free on
        GitHub. AI is optional; with a free Gemini key it stays free.
      </>,
    ],
    [
      "Will it apply to jobs without asking me?",
      <>
        Only if you turn on auto-apply, and even then every application waits for your approval
        unless you choose otherwise. It never applies twice to the same job, and it stops and asks
        you about anything it is unsure of.
      </>,
    ],
    [
      "Does the AI make things up on my resume?",
      <>
        It is told not to, and {APP_NAME} checks every change in code: a tailored resume cannot add
        skills, numbers, employers or certificates that are not in your profile. You approve each
        resume before it is used.
      </>,
    ],
  ];
  return (
    <>
      <H1>Frequently asked questions</H1>
      <dl className="mt-6 space-y-8">
        {items.map(([q, a]) => (
          <div key={q}>
            <dt className="text-lg font-semibold">{q}</dt>
            <dd className="mt-2 leading-relaxed text-slate-700 dark:text-slate-300">{a}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

export function PrivacyPage() {
  return (
    <>
      <H1>Privacy policy</H1>
      <P>Effective 3 November 2026.</P>
      <P>
        {APP_NAME} is a browser extension that runs on your computer. Its developers run no server
        and receive none of your data. This policy explains what the extension stores and what it
        sends, and to whom.
      </P>

      <H2>What stays in your browser</H2>
      <P>
        Your profile, resumes and other files, preferences, saved answers, jobs, scores,
        applications and settings are stored in your browser (IndexedDB and extension storage). They
        are not sent to the developers. API keys are stored only on your device and are never
        synced.
      </P>

      <H2>What is sent, and only when you use the feature</H2>
      <Bullets>
        <li>
          <strong>Your AI provider</strong> (Google Gemini by default, or Groq, OpenRouter, a local
          Ollama, or an address you enter): job descriptions and the parts of your profile a task
          needs, with your email, phone number and links removed by default. The provider&apos;s own
          terms apply; on Gemini&apos;s free tier Google may use the content to improve its
          products.
        </li>
        <li>
          <strong>Public job boards</strong> ({AUTO_SITES} APIs): requests for public job listings
          of companies you add. No personal data is sent.
        </li>
        <li>
          <strong>GitHub</strong>: the shared job feed is downloaded from GitHub Pages, and if you
          import projects, your public repositories are read from the GitHub API.
        </li>
        <li>
          <strong>Application forms</strong>: when you press Autofill, or when you approved an
          automatic application, your answers are entered into that employer&apos;s form, which
          sends them to the employer when submitted.
        </li>
        <li>
          <strong>Browser sync</strong>: settings and saved answers that are not sensitive are
          stored in your browser&apos;s sync storage, which your browser vendor syncs between
          browsers signed in to your account.
        </li>
      </Bullets>

      <H2>What is never collected</H2>
      <P>
        No analytics, telemetry, advertising or tracking. {APP_NAME} does not read your email, your
        browsing history or your cookies, and never stores or types passwords for job sites.
      </P>

      <H2>Permissions</H2>
      <P>
        Every permission and why it is needed is listed in{" "}
        <A href={`${REPO_URL}/blob/main/docs/PERMISSIONS.md`}>PERMISSIONS.md</A>. Access to
        LinkedIn, Workday and other AI providers is requested only when you turn those on.
      </P>

      <H2>Your control</H2>
      <P>
        In Settings you can export everything to a file, import it, or delete everything. Removing
        the extension also removes its data from your browser.
      </P>

      <H2>Contact</H2>
      <P>
        Questions or concerns: open an issue on <A href={`${REPO_URL}/issues`}>GitHub</A>.
      </P>
    </>
  );
}
