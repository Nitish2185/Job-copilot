/**
 * Saved resume versions (spec 14.2 step 7): the structured document plus its PDF
 * in the files table. Tailored versions are linked to a job.
 */
import type { ResumeDocument, ResumeVersion } from "@job-copilot/shared";
import type { JobCopilotDB } from "../db/db";

export const PDF_MIME = "application/pdf";

const iso = (date: Date) => date.toISOString().replace(/\.\d{3}Z$/, "Z");

export interface NewResumeVersion {
  kind: "base_generated" | "tailored";
  jobId?: string;
  document: ResumeDocument;
  pdf: Uint8Array;
  fileName: string;
  pickedProjectIds: string[];
  keywordsTargeted: string[];
  issues: string[];
  template: string;
  approvedByUser: boolean;
}

export async function saveResumeVersion(
  db: JobCopilotDB,
  input: NewResumeVersion,
  now = new Date(),
): Promise<ResumeVersion> {
  const fileId = crypto.randomUUID();
  const at = iso(now);
  const version: ResumeVersion = {
    id: crypto.randomUUID(),
    kind: input.kind,
    ...(input.jobId && { jobId: input.jobId }),
    createdAt: at,
    document: input.document,
    fileId,
    pickedProjectIds: input.pickedProjectIds,
    keywordsTargeted: input.keywordsTargeted,
    validation: { passed: input.issues.length === 0, issues: input.issues },
    template: input.template,
    approvedByUser: input.approvedByUser,
  };
  await db.transaction("rw", db.files, db.resumeVersions, async () => {
    await db.files.put({
      id: fileId,
      name: input.fileName,
      mimeType: PDF_MIME,
      blob: new Blob([input.pdf.slice()], { type: PDF_MIME }),
      createdAt: at,
    });
    // One generated base resume at a time: replace the previous one.
    if (input.kind === "base_generated") {
      const old = await db.resumeVersions.where("kind").equals("base_generated").toArray();
      await db.files.bulkDelete(old.map((v) => v.fileId));
      await db.resumeVersions.bulkDelete(old.map((v) => v.id));
    }
    await db.resumeVersions.put(version);
  });
  return version;
}

/** Deletes a version and its PDF. Versions linked to an application are kept. */
export async function deleteResumeVersion(db: JobCopilotDB, id: string): Promise<boolean> {
  const version = await db.resumeVersions.get(id);
  if (!version) return false;
  const used = await db.applications.filter((a) => a.resumeVersionId === id).count();
  if (used > 0) return false;
  await db.transaction("rw", db.files, db.resumeVersions, async () => {
    await db.files.delete(version.fileId);
    await db.resumeVersions.delete(id);
  });
  return true;
}
