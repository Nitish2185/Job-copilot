/**
 * Turns a resume document into a fitted PDF in an extension page. The PDF
 * library is loaded only when a resume is made (it is large).
 */
import { tagSkills, type JdAnalysis, type Profile, type ResumeDocument } from "@job-copilot/shared";
import { jobSkillIds } from "./pick";
import type { FitResult } from "./pdf/render";
import type { PageSize, ResumeTemplate } from "./pdf/setup";

/** US and Canadian resumes use Letter paper; everyone else A4. */
export function pageSizeFor(country: string): PageSize {
  return country === "US" || country === "CA" ? "LETTER" : "A4";
}

/** How many of the job's skills a bullet mentions (used to drop the least relevant bullets). */
export function relevanceFor(
  analysis: Pick<JdAnalysis, "mustHave" | "keywords"> | undefined,
): (text: string) => number {
  if (!analysis) return () => 0;
  const wanted = jobSkillIds(analysis);
  return (text) => tagSkills(text).filter((id) => wanted.has(id)).length;
}

export async function makeResumePdf(
  profile: Profile,
  document: ResumeDocument,
  options: { template: ResumeTemplate; analysis?: JdAnalysis },
): Promise<FitResult> {
  const [{ fitResume }, { registerBundledFonts }] = await Promise.all([
    import("./pdf/render"),
    import("./pdf/browserFonts"),
  ]);
  registerBundledFonts();
  return fitResume(document, {
    template: options.template,
    pageSize: pageSizeFor(profile.basics.country),
    totalYears: profile.totalExperienceMonths / 12,
    relevance: relevanceFor(options.analysis),
  });
}

/** The cover letter as a PDF (for forms that need a file). */
export async function makeCoverLetterPdf(profile: Profile, text: string): Promise<Uint8Array> {
  const [{ renderCoverLetterPdf }, { registerBundledFonts }, { locationLine }] = await Promise.all([
    import("./pdf/render"),
    import("./pdf/browserFonts"),
    import("./document"),
  ]);
  registerBundledFonts();
  const { basics } = profile;
  return renderCoverLetterPdf({
    fullName: basics.fullName,
    contact: [basics.email, basics.phone, locationLine(basics)]
      .filter((v) => v !== "")
      .join("  |  "),
    date: new Date().toLocaleDateString("en-US", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    text,
    pageSize: pageSizeFor(basics.country),
  });
}
