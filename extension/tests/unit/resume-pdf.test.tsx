/// <reference types="node" />
import { fileURLToPath } from "node:url";
import type { Profile } from "@job-copilot/shared";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { beforeAll, describe, expect, it } from "vitest";
import { emptyProfile } from "@/lib/profile/profile";
import { pdfItemsToText } from "@/lib/resume/extract";
import { baseProjects, buildResumeDocument, resumeFileName } from "@/lib/resume/document";
import { registerResumeFonts } from "@/lib/resume/pdf/setup";
import { countPdfPages, fitResume, renderResumePdf } from "@/lib/resume/pdf/render";

const fontPath = (file: string) =>
  fileURLToPath(new URL(`../../public/fonts/${file}`, import.meta.url));

beforeAll(() => {
  registerResumeFonts(fontPath);
});

async function pdfText(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  const task = getDocument({ data: bytes.slice() });
  const doc = await task.promise;
  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    parts.push(pdfItemsToText((await (await doc.getPage(i)).getTextContent()).items));
  }
  const pages = doc.numPages;
  await task.destroy();
  // pdf.js returns bold and regular runs as separate items; the helper joins them with a space.
  return { text: parts.join("\n").replace(/ +,/g, ","), pages };
}

function profile(bulletsPerJob = 2, jobs = 2, months = 53): Profile {
  return {
    ...emptyProfile(new Date("2026-11-02T00:00:00Z")),
    basics: {
      fullName: "Aarav Mehta",
      email: "aarav.mehta@example.com",
      phone: "+91 99999 01234",
      city: "Pune",
      country: "IN",
      githubUsername: "aarav-dev",
      otherLinks: [],
    },
    headline: "Full-stack developer",
    summary: "Full-stack developer with 4 years of experience building React and Node.js apps.",
    skills: [
      { id: "react", displayName: "React", source: "resume" },
      { id: "nodejs", displayName: "Node.js", source: "resume" },
    ],
    experience: Array.from({ length: jobs }, (_, j) => ({
      id: `exp-${String(j)}`,
      company: `Example Company ${String(j)}`,
      title: "Software Engineer",
      startDate: `${String(2024 - j * 2)}-01`,
      endDate: j === 0 ? null : `${String(2025 - j * 2)}-12`,
      bullets: Array.from(
        { length: bulletsPerJob },
        (_, b) =>
          `Built and maintained feature number ${String(b + 1)} of the payments platform with React and Node.js for many internal teams`,
      ),
      skills: [],
    })),
    education: [
      {
        id: "ed",
        institution: "Example Institute of Technology",
        degree: "B.Tech",
        field: "Computer Science",
        startYear: 2016,
        endYear: 2020,
      },
    ],
    projects: [
      {
        id: "proj-1",
        name: "Job Board",
        description: "A job listing app",
        bullets: ["Built a Next.js job board"],
        techStack: ["nextjs", "postgresql"],
        links: { repo: "https://github.com/aarav-dev/job-board" },
        source: "github",
        included: true,
        highlight: false,
        updatedAt: "2026-10-01T00:00:00Z",
      },
    ],
    totalExperienceMonths: months,
  };
}

describe("resume PDF", () => {
  it("renders selectable text with standard headings on one page", async () => {
    const p = profile();
    const doc = buildResumeDocument(p, { projects: baseProjects(p) });
    const bytes = await renderResumePdf(doc, {
      template: "classic",
      fontSize: 10.5,
      pageSize: "A4",
    });
    const { text, pages } = await pdfText(bytes);
    expect(pages).toBe(1);
    expect(countPdfPages(bytes)).toBe(1);
    for (const expected of [
      "Aarav Mehta",
      "aarav.mehta@example.com",
      "Pune, India",
      "github.com/aarav-dev",
      "SUMMARY",
      "SKILLS",
      "React, Node.js",
      "EXPERIENCE",
      "Software Engineer, Example Company 0",
      "Jan 2024 – Present",
      "PROJECTS",
      "Job Board",
      "EDUCATION",
      "B.Tech, Computer Science, Example Institute of Technology",
    ]) {
      expect(text).toContain(expected);
    }
  }, 30_000);

  it("fits a long resume on one page by dropping old bullets first, then shrinking the font", async () => {
    const p = profile(9, 5);
    const doc = buildResumeDocument(p, { projects: baseProjects(p) });
    const result = await fitResume(doc, {
      template: "classic",
      pageSize: "A4",
      totalYears: 4,
      relevance: () => 0,
    });
    expect(result.fits).toBe(true);
    expect(result.pages).toBe(1);
    expect(result.dropped.length).toBeGreaterThan(0);
    // The oldest job loses bullets first and the newest keeps at least two.
    expect(result.dropped[0]?.experienceId).toBe("exp-4");
    expect(result.document.experience[0]?.bullets.length).toBeGreaterThanOrEqual(2);
    expect(result.fontSize).toBeGreaterThanOrEqual(9.5);
  }, 120_000);

  it("allows a second page only with more than 5 years of experience", async () => {
    // 22 jobs cannot fit on one page, even with one bullet each at 9.5 pt.
    const p = profile(2, 22, 120);
    const doc = buildResumeDocument(p, { projects: baseProjects(p) });
    const senior = await fitResume(doc, {
      template: "compact",
      pageSize: "A4",
      totalYears: 10,
      relevance: () => 0,
    });
    // Two pages are allowed, and the full resume fits on two at the normal size: nothing is dropped.
    expect(senior.pages).toBe(2);
    expect(senior.fits).toBe(true);
    expect(senior.fontSize).toBe(10);
    expect(senior.dropped).toEqual([]);

    const junior = await fitResume(doc, {
      template: "compact",
      pageSize: "A4",
      totalYears: 3,
      relevance: () => 0,
    });
    expect(junior.fits).toBe(false);
  }, 240_000);

  it("names the file after the person and company", () => {
    expect(resumeFileName("Aarav Kumar Mehta", "Acme, Inc.")).toBe(
      "Aarav_Mehta_Resume_Acme_Inc.pdf",
    );
    expect(resumeFileName("Zoë", undefined)).toBe("Zoe_Resume.pdf");
  });
});
