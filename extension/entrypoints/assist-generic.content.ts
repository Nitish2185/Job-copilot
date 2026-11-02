/**
 * Generic Assist adapter (spec 17.5): injected on demand into the page the user
 * is looking at, only when they press Autofill. Fills fields, highlights them and
 * never clicks anything that submits, advances or navigates.
 */
import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";
import { ASSIST_LOADED, AUTOFILL_COMMAND, manualAutofill } from "@/lib/apply/pageAutofill";

export default defineContentScript({
  matches: ["https://*/*", "http://*/*"],
  registration: "runtime",
  main() {
    const scope = window as unknown as Record<string, boolean>;
    // Injected twice, or the Auto site script already listens: one listener is enough.
    if (scope[ASSIST_LOADED]) return;
    scope[ASSIST_LOADED] = true;

    browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
      const m = message as { type?: string; resumeChoice?: "current" | "tailored" };
      if (m.type !== AUTOFILL_COMMAND) return undefined;
      manualAutofill(m.resumeChoice ?? "current").then(sendResponse, (e: unknown) => {
        sendResponse({ filled: 0, needsYou: 0, error: e instanceof Error ? e.message : String(e) });
      });
      return true;
    });
  },
});
