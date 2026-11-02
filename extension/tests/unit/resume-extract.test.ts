/// <reference types="node" />
import { readFileSync } from "node:fs";
import mammoth from "mammoth";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { extractContacts } from "@/lib/ai/redact";
import { pdfItemsToText, resumeKind } from "@/lib/resume/extract";

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url));
const expected = fixture("resume-fictional.txt").toString("utf8").trim();

describe("resume text extraction", () => {
  it("reads the fictional PDF with pdf.js", async () => {
    const task = getDocument({ data: new Uint8Array(fixture("resume-fictional.pdf")) });
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const text = pdfItemsToText((await page.getTextContent()).items);
    await task.destroy();
    expect(text).toContain("Aarav Mehta");
    expect(text).toContain("Software Engineer, Example Fintech Pvt Ltd (Jul 2022 - Present)");
    expect(text.split("\n").length).toBeGreaterThan(15);
  });

  it("reads the fictional DOCX with mammoth", async () => {
    const result = await mammoth.extractRawText({ buffer: fixture("resume-fictional.docx") });
    const lines = result.value.split("\n").filter((l) => l.trim() !== "");
    expect(lines).toEqual(expected.split("\n").filter((l) => l.trim() !== ""));
  });

  it("finds contact details locally before anything is sent to AI", () => {
    const contacts = extractContacts(expected);
    expect(contacts.emails).toEqual(["aarav.mehta@example.com"]);
    expect(contacts.phones).toEqual(["+91 99999 01234"]);
    expect(contacts.githubUsername).toBe("aarav-dev");
    expect(contacts.linkedinUrl).toBe("https://linkedin.com/in/aarav-mehta-example");
  });

  it("recognises PDF and Word files by type or extension", () => {
    expect(resumeKind({ name: "cv.PDF", type: "" })).toBe("pdf");
    expect(resumeKind({ name: "cv", type: "application/pdf" })).toBe("pdf");
    expect(resumeKind({ name: "cv.docx", type: "" })).toBe("docx");
    expect(resumeKind({ name: "cv.doc", type: "application/msword" })).toBeUndefined();
  });

  it("joins pdf.js text items into lines", () => {
    expect(
      pdfItemsToText([
        { str: "Hello", hasEOL: false },
        { str: "world", hasEOL: true },
        { str: "Second  line", hasEOL: true },
      ]),
    ).toBe("Hello world\nSecond line");
  });
});
