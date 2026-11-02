/**
 * Project-wide constants shared by the extension and the website.
 *
 * GITHUB_OWNER and GITHUB_REPO are rewritten by `pnpm run set-owner <owner> <repo>`;
 * everything else derives from them, so a fork only has to run that one script.
 */

export const APP_NAME = "Job Copilot";

export const GITHUB_OWNER = "Nitish2185";
export const GITHUB_REPO = "Job-copilot";

export const REPO_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;

/** GitHub Pages origin for this repository (owner names are lowercase in Pages hostnames). */
export const PAGES_BASE_URL = `https://${GITHUB_OWNER.toLowerCase()}.github.io/${GITHUB_REPO}/`;

/** Where the crawler publishes the shared job feed. Users can override it in Settings. */
export const FEED_BASE_URL = `${PAGES_BASE_URL}feed/`;

/** Highest feed `schemaVersion` this build understands. */
export const FEED_SCHEMA_VERSION = 1;

/**
 * The only hosts where the extension may ever submit an application (spec 2.2).
 * The submit guard compares the tab's hostname against this list exactly.
 */
export const AUTO_SUBMIT_HOSTS = [
  "boards.greenhouse.io",
  "job-boards.greenhouse.io",
  "jobs.lever.co",
  "jobs.eu.lever.co",
  "jobs.ashbyhq.com",
  "apply.workable.com",
  "jobs.smartrecruiters.com",
] as const;

export type AutoSubmitHost = (typeof AUTO_SUBMIT_HOSTS)[number];

/** Politeness limits for automatic submissions (spec 2.4). */
export const AUTO_APPLY_LIMITS = {
  pauseSecondsDefault: 90,
  pauseSecondsMin: 30,
  dailyCapDefault: 20,
  dailyCapMax: 50,
  perCompanyCapDefault: 2,
  perCompanyWindowDaysDefault: 30,
} as const;

/**
 * Default Gemini model: a free-tier Flash-Lite model (verified against
 * ai.google.dev/gemini-api/docs/models and /pricing on 2026-11-02). Flash-Lite has
 * the larger quota, so the default daily budget stays inside free limits.
 */
export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

/** Shown first in the model list; any model the provider lists can be chosen. */
export const SUGGESTED_GEMINI_MODELS = ["gemini-3.5-flash-lite", "gemini-3.8-flash"] as const;

export const AI_PROVIDER_IDS = ["gemini", "groq", "openrouter", "ollama", "custom"] as const;
export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];

/** OpenAI-compatible endpoints (spec 11.1), verified against each provider's docs on 2026-11-02. */
export const AI_PROVIDERS: Record<
  AiProviderId,
  { label: string; baseUrl: string; keyUrl: string | null; needsKey: boolean }
> = {
  gemini: {
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    keyUrl: "https://aistudio.google.com/apikey",
    needsKey: true,
  },
  groq: {
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    keyUrl: "https://console.groq.com/keys",
    needsKey: true,
  },
  openrouter: {
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    keyUrl: "https://openrouter.ai/keys",
    needsKey: true,
  },
  ollama: {
    label: "Ollama (on this computer)",
    baseUrl: "http://localhost:11434/v1",
    keyUrl: null,
    needsKey: false,
  },
  custom: {
    label: "Custom (OpenAI-compatible)",
    baseUrl: "",
    keyUrl: null,
    needsKey: false,
  },
};
