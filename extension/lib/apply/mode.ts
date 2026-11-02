/**
 * Which mode and adapter a page gets (spec 16.1). Auto only for hosts exactly in
 * AUTO_SUBMIT_HOSTS over https; known Assist sites get their own adapter;
 * everything else is Assist with the generic adapter.
 */
import { isAutoSubmitUrl } from "@job-copilot/shared";

export type AutoAdapterId = "greenhouse" | "lever" | "ashby" | "workable" | "smartrecruiters";
export type AssistAdapterId = "naukri" | "indeed" | "linkedin" | "workday" | "generic";
export type AdapterId = AutoAdapterId | AssistAdapterId;

export type ModeResolution =
  { mode: "auto"; adapterId: AutoAdapterId } | { mode: "assist"; adapterId: AssistAdapterId };

const AUTO_ADAPTERS: Record<string, AutoAdapterId> = {
  "boards.greenhouse.io": "greenhouse",
  "job-boards.greenhouse.io": "greenhouse",
  "jobs.lever.co": "lever",
  "jobs.eu.lever.co": "lever",
  "jobs.ashbyhq.com": "ashby",
  "apply.workable.com": "workable",
  "jobs.smartrecruiters.com": "smartrecruiters",
};

/** The host or any subdomain of it ("in.indeed.com" is on "indeed.com"; "indeed.com.evil.io" is not). */
export function onDomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

const ASSIST_ADAPTERS: [domain: string, adapter: AssistAdapterId][] = [
  ["naukri.com", "naukri"],
  ["indeed.com", "indeed"],
  ["linkedin.com", "linkedin"],
  ["myworkdayjobs.com", "workday"],
  ["myworkdaysite.com", "workday"],
];

export function resolveMode(url: string): ModeResolution {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { mode: "assist", adapterId: "generic" };
  }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  // E2E builds only: local fixture pages under /<adapter>/... act as that Auto site.
  if (import.meta.env.JOB_COPILOT_E2E === true && host === "127.0.0.1") {
    const first = parsed.pathname.split("/")[1] ?? "";
    const fixture = Object.values(AUTO_ADAPTERS).find((a) => a === first);
    if (fixture) return { mode: "auto", adapterId: fixture };
  }
  if (isAutoSubmitUrl(url)) {
    const adapterId = AUTO_ADAPTERS[host];
    if (adapterId) return { mode: "auto", adapterId };
  }
  for (const [domain, adapterId] of ASSIST_ADAPTERS) {
    if (onDomain(host, domain)) return { mode: "assist", adapterId };
  }
  return { mode: "assist", adapterId: "generic" };
}
