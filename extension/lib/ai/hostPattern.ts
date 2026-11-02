/**
 * The host permission pattern for an AI provider address, such as
 * "https://api.groq.com/*", or null when it is not a web address.
 * The port is left out so it matches the optional host patterns in the manifest.
 */
export function hostPattern(baseUrl: string): string | null {
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return `${url.protocol}//${url.hostname}/*`;
  } catch {
    return null;
  }
}
