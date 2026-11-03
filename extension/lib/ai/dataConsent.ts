/**
 * Firefox's built-in data consent (Firefox 140+): the extension declares that it
 * sends nothing by default, and that the optional AI features send profile text
 * (personallyIdentifyingInfo) and page text (websiteContent) to the AI provider
 * the user picked. Consent is asked together with the provider's host
 * permission, and AI calls refuse to run without it. Other browsers have no such
 * permission; there the host permission is the consent.
 */
import { browser } from "wxt/browser";

export const AI_DATA_COLLECTION = ["personallyIdentifyingInfo", "websiteContent"] as const;

export class AiConsentError extends Error {
  override name = "AiConsentError";
  constructor() {
    super(
      "Allow Job Copilot to send data to your AI provider first: Settings > AI provider > Save and test.",
    );
  }
}

// BROWSER, not FIREFOX: tests see the env flags as strings ("false" is truthy).
const usesDataConsent = (): boolean => import.meta.env.BROWSER === "firefox";

/** The permission request for an AI provider's address (and, on Firefox, the data consent). */
export function aiPermissionRequest(origins: string[]): { origins: string[] } {
  return usesDataConsent()
    ? ({ origins, data_collection: [...AI_DATA_COLLECTION] } as { origins: string[] })
    : { origins };
}

export async function hasAiDataConsent(): Promise<boolean> {
  if (!usesDataConsent()) return true;
  return browser.permissions
    .contains({ data_collection: [...AI_DATA_COLLECTION] } as never)
    .catch(() => false);
}
