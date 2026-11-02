/**
 * Naukri and Indeed (spec 17.1, 17.2): Assist only. Autofill on request, the
 * logged-out banner, filling each new step, confirmation detection, search-page
 * badges and save-from-page. It never submits, advances or clicks site controls.
 */
import { defineContentScript } from "wxt/utils/define-content-script";
import { ASSIST_ADAPTERS } from "@/lib/apply/adapters/assist";
import { startAssistSite } from "@/lib/apply/assistSite";
import { resolveMode } from "@/lib/apply/mode";

export const ASSIST_SITE_MATCHES = ["https://www.naukri.com/*", "https://*.indeed.com/*"];

export default defineContentScript({
  matches: ASSIST_SITE_MATCHES,
  runAt: "document_idle",
  main() {
    const { adapterId } = resolveMode(location.href);
    if (adapterId === "naukri" || adapterId === "indeed") {
      startAssistSite(ASSIST_ADAPTERS[adapterId], adapterId);
    }
  },
});
