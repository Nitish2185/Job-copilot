/**
 * Assist sites behind an optional host permission (spec 17.3, 17.4): off until
 * the user enables them in Settings. Enabling requests the permission, then
 * registers the site script for these origins only.
 */
export type OptionalSiteId = "linkedin" | "workday";

export const OPTIONAL_SITES: Record<
  OptionalSiteId,
  { name: string; origins: string[]; explanation: string }
> = {
  linkedin: {
    name: "LinkedIn",
    origins: ["https://www.linkedin.com/*"],
    explanation:
      "Assist only: Job Copilot reads job pages, shows match badges on search results and fills Easy Apply steps when you press Autofill. You click Next, Review and Submit yourself.",
  },
  workday: {
    name: "Workday",
    origins: ["https://*.myworkdayjobs.com/*", "https://*.myworkdaysite.com/*"],
    explanation:
      "Assist only: you sign in or create the company account yourself. Job Copilot fills My Information, My Experience and questions when you press Autofill. You click Save and Continue and Submit yourself.",
  },
};

export const OPTIONAL_SITE_SCRIPT = "/content-scripts/assist-optional.js";

export const scriptIdFor = (site: OptionalSiteId) => `jc-assist-${site}`;
