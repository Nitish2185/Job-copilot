/**
 * Settings (chrome.storage.sync), secrets and runtime flags (chrome.storage.local).
 * Secrets never touch sync storage, logs or exports (spec 6).
 */
import {
  SecretsSchema,
  SettingsSchema,
  defaultSettings,
  type Secrets,
  type Settings,
} from "@job-copilot/shared";
import { browser } from "wxt/browser";
import { z } from "zod";

const SETTINGS_KEY = "settings";
const SECRETS_KEY = "secrets";
const FLAGS_KEY = "flags";

export type DeepPartial<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Merges `patch` into `base`; arrays and other values replace, objects merge. */
export function deepMerge<T>(base: T, patch: DeepPartial<T> | undefined): T {
  if (patch === undefined) return base;
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch as T;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    out[key] = isPlainObject(out[key]) && isPlainObject(value) ? deepMerge(out[key], value) : value;
  }
  return out as T;
}

const isDevelopment = (): boolean => import.meta.env.DEV;

/** Stored settings with defaults filled in. Invalid stored values fall back to defaults. */
export async function loadSettings(): Promise<Settings> {
  const stored: unknown = (await browser.storage.sync.get(SETTINGS_KEY))[SETTINGS_KEY];
  const defaults = defaultSettings({ development: isDevelopment() });
  if (stored === undefined) return defaults;
  const parsed = SettingsSchema.safeParse(deepMerge(defaults, stored as DeepPartial<Settings>));
  return parsed.success ? parsed.data : defaults;
}

/** Validates and saves a partial update; throws when the result is invalid. */
export async function updateSettings(patch: DeepPartial<Settings>): Promise<Settings> {
  const next = SettingsSchema.parse(deepMerge(await loadSettings(), patch));
  await browser.storage.sync.set({ [SETTINGS_KEY]: next });
  return next;
}

/** Writes defaults on first install (development builds start in dry-run mode). */
export async function ensureSettings(): Promise<Settings> {
  const stored: unknown = (await browser.storage.sync.get(SETTINGS_KEY))[SETTINGS_KEY];
  if (stored !== undefined) return loadSettings();
  const defaults = defaultSettings({ development: isDevelopment() });
  await browser.storage.sync.set({ [SETTINGS_KEY]: defaults });
  return defaults;
}

export function onSettingsChanged(callback: (settings: Settings) => void): () => void {
  const listener = (changes: Record<string, unknown>, area: string) => {
    if (area === "sync" && SETTINGS_KEY in changes) void loadSettings().then(callback);
  };
  browser.storage.onChanged.addListener(listener);
  return () => {
    browser.storage.onChanged.removeListener(listener);
  };
}

export async function loadSecrets(): Promise<Secrets> {
  const stored: unknown = (await browser.storage.local.get(SECRETS_KEY))[SECRETS_KEY];
  const parsed = SecretsSchema.safeParse(stored ?? {});
  return parsed.success ? parsed.data : SecretsSchema.parse({});
}

export async function updateSecrets(patch: Partial<Secrets>): Promise<void> {
  const next = SecretsSchema.parse({ ...(await loadSecrets()), ...patch });
  await browser.storage.local.set({ [SECRETS_KEY]: next });
}

/** Small runtime flags kept on this device only. */
export const FlagsSchema = z.object({
  installedAt: z.string().optional(),
  /** Kill switch for auto-apply, with the reason shown to the user. */
  autoApplyPaused: z.object({ at: z.string(), reason: z.string() }).optional(),
  onboardingStep: z.number().int().nonnegative().optional(),
});
export type Flags = z.infer<typeof FlagsSchema>;

export async function loadFlags(): Promise<Flags> {
  const stored: unknown = (await browser.storage.local.get(FLAGS_KEY))[FLAGS_KEY];
  const parsed = FlagsSchema.safeParse(stored ?? {});
  return parsed.success ? parsed.data : {};
}

export async function updateFlags(patch: Partial<Flags>): Promise<Flags> {
  const next = FlagsSchema.parse({ ...(await loadFlags()), ...patch });
  await browser.storage.local.set({ [FLAGS_KEY]: next });
  return next;
}
