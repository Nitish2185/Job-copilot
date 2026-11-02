/**
 * Resume upload: text extraction from PDF (pdf.js, worker bundled locally) and
 * DOCX (mammoth), run in the dashboard page (spec 10, step 3).
 */
export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
export const SCANNED_TEXT_THRESHOLD = 200;

export const PDF_MIME = "application/pdf";
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export class ResumeFileError extends Error {
  override name = "ResumeFileError";
}

export interface ExtractedResume {
  text: string;
  /** Set when the text looks too short (probably a scanned image PDF). */
  warning?: string;
}

interface TextItem {
  str: string;
  hasEOL: boolean;
}

/** Joins pdf.js text items into lines. */
export function pdfItemsToText(items: readonly unknown[]): string {
  let out = "";
  for (const item of items) {
    if (typeof item !== "object" || item === null || !("str" in item)) continue;
    const { str, hasEOL } = item as TextItem;
    out += str;
    out += hasEOL ? "\n" : str.endsWith(" ") || str === "" ? "" : " ";
  }
  return out
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function resumeKind(file: { name: string; type: string }): "pdf" | "docx" | undefined {
  const name = file.name.toLowerCase();
  if (file.type === PDF_MIME || name.endsWith(".pdf")) return "pdf";
  if (file.type === DOCX_MIME || name.endsWith(".docx")) return "docx";
  return undefined;
}

function finish(text: string): ExtractedResume {
  const clean = text.trim();
  return clean.length < SCANNED_TEXT_THRESHOLD
    ? {
        text: clean,
        warning: "This looks like a scanned resume. Please upload a PDF with selectable text.",
      }
    : { text: clean };
}

async function pdfText(data: ArrayBuffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: new Uint8Array(data) });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(pdfItemsToText(content.items));
  }
  await task.destroy();
  return pages.join("\n\n");
}

async function docxText(data: ArrayBuffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ arrayBuffer: data });
  return result.value;
}

/** Extracts resume text from a PDF or DOCX file up to 5 MB. */
export async function extractResumeText(file: File): Promise<ExtractedResume> {
  if (file.size > MAX_RESUME_BYTES) throw new ResumeFileError("The file is larger than 5 MB.");
  const kind = resumeKind(file);
  if (!kind) throw new ResumeFileError("Please upload a PDF or a Word (.docx) file.");
  const data = await file.arrayBuffer();
  try {
    return finish(kind === "pdf" ? await pdfText(data) : await docxText(data));
  } catch (error) {
    if (error instanceof ResumeFileError) throw error;
    throw new ResumeFileError("Could not read this file. Is it a valid PDF or Word document?");
  }
}
