/**
 * LinkedIn and Workday (spec 17.3, 17.4): registered at runtime only after the
 * user enables the site in Settings and grants its optional host permission.
 * Same Assist behaviour as Naukri and Indeed.
 */
import { defineContentScript } from "wxt/utils/define-content-script";
import { ASSIST_ADAPTERS } from "@/lib/apply/adapters/assist";
import { startAssistSite } from "@/lib/apply/assistSite";
import { resolveMode } from "@/lib/apply/mode";
import { OPTIONAL_SITES } from "@/lib/apply/optionalSites";

export default defineContentScript({
  matches: [...OPTIONAL_SITES.linkedin.origins, ...OPTIONAL_SITES.workday.origins],
  registration: "runtime",
  main() {
    const { adapterId } = resolveMode(location.href);
    if (adapterId === "linkedin" || adapterId === "workday") {
      startAssistSite(ASSIST_ADAPTERS[adapterId], adapterId);
    }
  },
});
