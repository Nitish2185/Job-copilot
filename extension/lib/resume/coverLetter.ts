/**
 * Cover letter checks and storage (spec 15.1). The same rules as tailored
 * resumes (14.4): a sentence that adds a skill, number, employer or
 * certification the profile does not have is removed and the reason recorded.
 */
import type { CoverLetter, Profile, Project } from "@job-copilot/shared";
import type { JobCopilotDB } from "../db/db";
import { allowedSkills, checkText, knownNames, wordCount } from "./validate";

export const COVER_LETTER_WORDS = { min: 150, max: 250 } as const;

const iso = (date: Date) => date.toISOString().replace(/\.\d{3}Z$/, "Z");

export function validateCoverLetter(
  text: string,
  profile: Profile,
  picked: readonly Project[],
  jobCompany: string,
): { text: string; issues: string[] } {
  const years = profile.totalExperienceMonths / 12;
  const projectTexts = picked.flatMap((p) => [p.description, ...p.bullets]);
  const originals = [
    profile.summary,
    profile.headline ?? "",
    ...profile.experience.flatMap((e) => e.bullets),
    ...projectTexts,
  ];
  const rules = {
    allowedSkills: allowedSkills(
      [...profile.skills.map((s) => s.id), ...picked.flatMap((p) => p.techStack)],
      originals,
    ),
    originals,
    allowedNumbers: [Math.floor(years), Math.round(years)],
    known: knownNames(profile, [jobCompany]),
    certifications: profile.certifications.map((c) => c.name),
    maxWords: Number.MAX_SAFE_INTEGER,
  };
  const issues: string[] = [];
  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((paragraph) =>
      paragraph
        .split(/(?<=[.!?])\s+/)
        .filter((sentence) => {
          if (sentence.trim() === "") return false;
          const problems = checkText(sentence, rules);
          if (problems.length === 0) return true;
          issues.push(`Removed a sentence that ${problems.join("; ")}: “${sentence.trim()}”`);
          return false;
        })
        .join(" ")
        .trim(),
    )
    .filter((p) => p !== "");
  const clean = paragraphs.join("\n\n");
  const words = wordCount(clean);
  if (words < COVER_LETTER_WORDS.min || words > COVER_LETTER_WORDS.max) {
    issues.push(
      `The letter has ${String(words)} words; ${String(COVER_LETTER_WORDS.min)}-${String(COVER_LETTER_WORDS.max)} reads best.`,
    );
  }
  return { text: clean, issues };
}

/** Saves the job's cover letter (one per job; a new one replaces the old). */
export async function saveCoverLetter(
  db: JobCopilotDB,
  input: { jobId: string; text: string; issues: string[] },
  now = new Date(),
): Promise<CoverLetter> {
  const letter: CoverLetter = {
    id: crypto.randomUUID(),
    jobId: input.jobId,
    text: input.text,
    createdAt: iso(now),
    validation: { passed: input.issues.length === 0, issues: input.issues },
  };
  await db.transaction("rw", db.coverLetters, db.files, async () => {
    const old = await db.coverLetters.where("jobId").equals(input.jobId).toArray();
    await db.files.bulkDelete(
      old.map((l) => l.fileId).filter((id): id is string => id !== undefined),
    );
    await db.coverLetters.bulkDelete(old.map((l) => l.id));
    await db.coverLetters.put(letter);
  });
  return letter;
}

/** `<FirstName>_<LastName>_Cover_Letter_<Company>.pdf`. */
export function coverLetterFileName(resumeName: string): string {
  return resumeName.replace("_Resume", "_Cover_Letter");
}
