/**
 * Generic Assist adapter (spec 17.5): injected on demand into the page the user
 * is looking at, only when they press Autofill. Fills fields, highlights them and
 * never clicks anything that submits, advances or navigates.
 */
import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";
import { runAutofill, type AutofillData } from "@/lib/apply/engine";
import { showOverlay } from "@/lib/apply/overlay";
import { sendMessage } from "@/lib/messaging/client";

const COMMAND = "jc-autofill";
const LOADED = "__jobCopilotAssistLoaded";

export default defineContentScript({
  matches: ["https://*/*", "http://*/*"],
  registration: "runtime",
  main() {
    const scope = window as unknown as Record<string, boolean>;
    // Pressing Autofill twice injects this file twice; one listener is enough.
    if (scope[LOADED]) return;
    scope[LOADED] = true;

    browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
      const m = message as { type?: string; resumeChoice?: "current" | "tailored" };
      if (m.type !== COMMAND) return undefined;
      void autofill(m.resumeChoice ?? "current").then(sendResponse, (e: unknown) => {
        sendResponse({ filled: 0, needsYou: 0, error: e instanceof Error ? e.message : String(e) });
      });
      return true;
    });
  },
});

async function autofill(resumeChoice: "current" | "tailored") {
  const data: AutofillData = await sendMessage("apply/context", {
    url: location.href,
    resumeChoice,
  });
  const { report, undo } = await runAutofill(document, data, {
    // Pressing Autofill only ever fills; submitting is never part of it.
    mode: "assist",
    askAi: (q) => sendMessage("ai/answerQuestion", q),
    now: () => new Date(),
  });
  showOverlay(document, report, () => {
    for (const step of [...undo].reverse()) step();
  });
  await sendMessage("apply/report", { report });
  return {
    filled: report.fields.filter((f) => f.status === "filled").length,
    needsYou: report.fields.filter((f) => f.status === "needs_you" || f.status === "error").length,
  };
}
