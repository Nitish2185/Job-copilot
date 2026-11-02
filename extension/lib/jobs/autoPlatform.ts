import type { Job } from "@job-copilot/shared";
import { resolveMode } from "../apply/mode";

const AUTO_NAMES: Record<string, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  workable: "Workable",
  smartrecruiters: "SmartRecruiters",
};

/** The Auto platform a job from an Assist site really applies through, if any (spec 17.1). */
export function autoPlatformFor(job: Job): string | undefined {
  if (!job.externalApplyUrl) return undefined;
  const resolved = resolveMode(job.externalApplyUrl);
  return resolved.mode === "auto" ? AUTO_NAMES[resolved.adapterId] : undefined;
}
