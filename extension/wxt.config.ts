import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";
import { APP_NAME, GITHUB_OWNER, PAGES_BASE_URL } from "@job-copilot/shared/config";

const GECKO_ID = `job-copilot@${GITHUB_OWNER.toLowerCase()}.github.io`;

/** Public job-board APIs read for personal company boards (spec 9.2). */
const ATS_API_HOSTS = [
  "https://boards-api.greenhouse.io/*",
  "https://api.lever.co/*",
  "https://api.eu.lever.co/*",
  "https://api.ashbyhq.com/*",
  "https://api.smartrecruiters.com/*",
  "https://apply.workable.com/*",
];

/** The shared feed on GitHub Pages. */
const FEED_HOST = `${new URL(PAGES_BASE_URL).origin}/*`;

/** End-to-end test builds also read fixture servers on this machine. Never in releases. */
const E2E = process.env.JOB_COPILOT_E2E === "1";
const E2E_HOSTS = E2E ? ["http://localhost/*", "http://127.0.0.1/*"] : [];

// Firefox builds use Manifest V2 (WXT's default); Chrome and Edge use MV3.
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  // Explicit imports keep every file readable without generated globals.
  imports: false,
  outDirTemplate: E2E ? "{{browser}}-mv{{manifestVersion}}-e2e" : undefined,
  manifest: ({ browser }) => ({
    name: APP_NAME,
    description:
      "Free, private job-hunting assistant for developers: finds and ranks jobs, prepares applications, and fills forms.",
    action: { default_title: APP_NAME },
    permissions: ["storage", "unlimitedStorage", "alarms"],
    host_permissions: [...ATS_API_HOSTS, FEED_HOST, ...E2E_HOSTS],
    ...(browser === "firefox" && {
      browser_specific_settings: { gecko: { id: GECKO_ID } },
    }),
  }),
  vite: () => ({
    plugins: [tailwindcss()],
    define: { "import.meta.env.JOB_COPILOT_E2E": JSON.stringify(E2E) },
  }),
});
