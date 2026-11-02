/**
 * Auto site script (spec 16.5, 17.6): runs on the allowlisted application hosts
 * only. The background asks it to fill (step 4), to submit through the guarded
 * submit function (step 6) and to report confirmation or errors (step 7). It also
 * answers the user's Autofill command like the generic script (fill only).
 */
import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";
import { GENERIC_ADAPTER } from "@/lib/apply/adapters/assist";
import { AUTO_ADAPTERS } from "@/lib/apply/adapters/auto";
import { handleSiteCommand } from "@/lib/apply/assistSite";
import type { AutofillData } from "@/lib/apply/engine";
import { submitApplication } from "@/lib/apply/guards";
import { resolveMode } from "@/lib/apply/mode";
import {
  ASSIST_LOADED,
  AUTOFILL_COMMAND,
  fillThisPage,
  manualAutofill,
} from "@/lib/apply/pageAutofill";

export const AUTO_HOST_MATCHES = [
  "https://boards.greenhouse.io/*",
  "https://job-boards.greenhouse.io/*",
  "https://jobs.lever.co/*",
  "https://jobs.eu.lever.co/*",
  "https://jobs.ashbyhq.com/*",
  "https://apply.workable.com/*",
  "https://jobs.smartrecruiters.com/*",
];

type Message =
  | { type: "jc-auto-fill"; data: AutofillData }
  | { type: "jc-auto-submit" }
  | { type: "jc-auto-status" }
  | { type: "jc-autofill"; resumeChoice?: "current" | "tailored" };

function adapter() {
  const resolved = resolveMode(location.href);
  return resolved.mode === "auto" ? AUTO_ADAPTERS[resolved.adapterId] : undefined;
}

export default defineContentScript({
  // E2E builds add the local fixture host (wxt.config.ts); release builds never do.
  matches: AUTO_HOST_MATCHES,
  runAt: "document_idle",
  main() {
    const scope = window as unknown as Record<string, boolean>;
    scope[ASSIST_LOADED] = true;

    browser.runtime.onMessage.addListener((raw: unknown, _sender, sendResponse) => {
      const message = raw as Message;
      const site = adapter();
      switch (message.type) {
        case "jc-auto-fill":
          fillThisPage(message.data, "auto").then(
            ({ report }) => {
              sendResponse({ report, submitFound: Boolean(site?.findSubmitControl?.(document)) });
            },
            (e: unknown) => {
              sendResponse({ error: e instanceof Error ? e.message : String(e) });
            },
          );
          return true;
        case "jc-auto-submit": {
          const control = site?.findSubmitControl?.(document);
          if (!site || !control) {
            sendResponse({ ok: false, error: "No submit button on this page." });
            return undefined;
          }
          // Answer first: submitting may unload the page.
          sendResponse({ ok: true });
          setTimeout(() => {
            try {
              submitApplication(control);
            } catch {
              // The host guard refused; the background sees no confirmation and stops.
            }
          }, 50);
          return undefined;
        }
        case "jc-auto-status":
          sendResponse({
            confirmation: site?.detectConfirmation(document) ?? { confirmed: false },
            errors: site?.detectErrors(document) ?? [],
            captcha: site?.detectCaptcha(document) ?? false,
            verificationCode: site?.detectVerificationCode(document) ?? false,
            page: site?.detectPage(document) ?? "other",
          });
          return undefined;
        case "jc-autofill":
          if ((raw as { type?: string }).type !== AUTOFILL_COMMAND) return undefined;
          manualAutofill(message.resumeChoice ?? "current").then(sendResponse, (e: unknown) => {
            sendResponse({
              filled: 0,
              needsYou: 0,
              error: e instanceof Error ? e.message : String(e),
            });
          });
          return true;
        default:
          // Save-job and diagnostics: the job is read from the page's schema.org data.
          return handleSiteCommand(
            raw as { type?: string },
            site ? { ...site, readJob: GENERIC_ADAPTER.readJob } : GENERIC_ADAPTER,
            sendResponse,
          );
      }
    });
  },
});
