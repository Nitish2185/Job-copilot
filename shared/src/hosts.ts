import { AUTO_SUBMIT_HOSTS, type AutoSubmitHost } from "./config";

/** Lowercase hostname of an absolute URL, or null when the URL cannot be parsed. */
export function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Exact match against the Auto allowlist. Subdomains and look-alikes never match. */
export function isAutoSubmitHost(hostname: string): hostname is AutoSubmitHost {
  return (AUTO_SUBMIT_HOSTS as readonly string[]).includes(hostname.toLowerCase());
}

/** True only for https URLs whose hostname is exactly an allowlisted host. */
export function isAutoSubmitUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && isAutoSubmitHost(parsed.hostname);
  } catch {
    return false;
  }
}

/** Auto mode only for allowlisted application hosts; everything else is Assist. */
export function modeForUrl(url: string | undefined): "auto" | "assist" {
  return url !== undefined && isAutoSubmitUrl(url) ? "auto" : "assist";
}
