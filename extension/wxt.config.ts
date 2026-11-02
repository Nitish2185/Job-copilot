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

/** Default AI provider (the user's own Gemini key) and GitHub project import (spec 9.2). */
const CORE_API_HOSTS = ["https://generativelanguage.googleapis.com/*", "https://api.github.com/*"];

/**
 * Requested at runtime only when the user picks the feature, one origin at a time:
 * other AI providers, a local Ollama, or a custom OpenAI-compatible endpoint.
 */
const OPTIONAL_HOSTS = [
  "https://api.groq.com/*",
  "https://openrouter.ai/*",
  "http://localhost/*",
  "http://127.0.0.1/*",
  "https://*/*",
];

/** Application forms where Job Copilot may fill and, when the user enabled it, submit (AUTO_SUBMIT_HOSTS). */
const AUTO_APPLY_HOSTS = [
  "https://boards.greenhouse.io/*",
  "https://job-boards.greenhouse.io/*",
  "https://jobs.lever.co/*",
  "https://jobs.eu.lever.co/*",
  "https://jobs.ashbyhq.com/*",
  "https://jobs.smartrecruiters.com/*",
];

/** The shared feed on GitHub Pages. */
const FEED_HOST = `${new URL(PAGES_BASE_URL).origin}/*`;

/** End-to-end test builds also read fixture servers on this machine. Never in releases. */
const E2E = process.env.JOB_COPILOT_E2E === "1";
const E2E_HOSTS = E2E ? ["http://localhost/*", "http://127.0.0.1/*"] : [];

/** Extension pages: own scripts only, plus WebAssembly for the resume PDF layout engine. */
const EXTENSION_CSP = "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';";

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
    permissions: [
      "storage",
      "unlimitedStorage",
      "alarms",
      "scripting",
      "activeTab",
      "contextMenus",
      "notifications",
    ],
    commands: {
      autofill: {
        suggested_key: { default: "Alt+Shift+F" },
        description: "Autofill the application form on this page",
      },
      "toggle-side-panel": {
        suggested_key: { default: "Alt+Shift+J" },
        description: "Open the Job Copilot side panel",
      },
    },
    host_permissions: [
      ...ATS_API_HOSTS,
      ...AUTO_APPLY_HOSTS,
      ...CORE_API_HOSTS,
      FEED_HOST,
      ...E2E_HOSTS,
    ],
    // MV2 (Firefox) lists optional hosts under optional_permissions; WXT does not convert them.
    // 'wasm-unsafe-eval' lets the PDF layout engine (WebAssembly) run; no eval, no remote code.
    ...(browser === "firefox"
      ? {
          optional_permissions: OPTIONAL_HOSTS,
          browser_specific_settings: { gecko: { id: GECKO_ID } },
          content_security_policy: EXTENSION_CSP,
        }
      : {
          optional_host_permissions: OPTIONAL_HOSTS,
          content_security_policy: { extension_pages: EXTENSION_CSP },
        }),
  }),
  hooks: {
    // E2E builds run the Auto site script on local fixture pages too; release builds never do.
    "build:manifestGenerated": (_wxt, manifest) => {
      if (!E2E) return;
      for (const script of manifest.content_scripts ?? []) {
        if (script.js?.some((file) => file.includes("auto-ats"))) {
          script.matches = [...(script.matches ?? []), "http://127.0.0.1/*"];
        }
      }
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
    define: { "import.meta.env.JOB_COPILOT_E2E": JSON.stringify(E2E) },
  }),
});
