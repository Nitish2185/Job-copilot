/**
 * Renders the resume PDF and fits it to one page (spec 14.5): first drop the
 * least relevant bullets of the oldest jobs, then shrink the font 10.5 -> 10 ->
 * 9.5 pt (never smaller). People with more than 5 years of experience may use
 * two pages when one is not enough.
 */
import type { ResumeDocument } from "@job-copilot/shared";
import { pdf } from "@react-pdf/renderer";
import { CoverLetterPdf, type CoverLetterPdfProps } from "./CoverLetterPdf";
import { ResumePdf } from "./ResumePdf";
import type { PageSize, ResumeTemplate } from "./setup";

export const FONT_STEPS: Record<ResumeTemplate, readonly number[]> = {
  classic: [10.5, 10, 9.5],
  compact: [10, 9.5],
};
export const MIN_FONT_SIZE = 9.5;
const MAX_RENDERS = 40;

export interface RenderOptions {
  template: ResumeTemplate;
  fontSize: number;
  pageSize: PageSize;
}

export type Renderer = (doc: ResumeDocument, options: RenderOptions) => Promise<Uint8Array>;

export const renderResumePdf: Renderer = async (doc, options) => {
  const blob = await pdf(<ResumePdf doc={doc} {...options} />).toBlob();
  return new Uint8Array(await blob.arrayBuffer());
};

/** Page count of a PDF written by react-pdf (page objects are plain dictionaries). */
export function countPdfPages(bytes: Uint8Array): number {
  let text = "";
  for (let i = 0; i < bytes.length; i += 65_536) {
    text += String.fromCharCode(...bytes.subarray(i, i + 65_536));
  }
  return text.match(/\/Type\s*\/Page(?![s\w])/g)?.length ?? 0;
}

export interface FitResult {
  bytes: Uint8Array;
  pages: number;
  fontSize: number;
  document: ResumeDocument;
  dropped: { experienceId: string; text: string }[];
  /** False when the resume is still longer than allowed. */
  fits: boolean;
}

/**
 * The least relevant bullet of the oldest job that can lose one (older jobs keep
 * at least 1 bullet, the most recent at least 2).
 */
function bulletToDrop(
  doc: ResumeDocument,
  relevance: (text: string) => number,
): { experienceIndex: number; bulletIndex: number } | undefined {
  for (let e = doc.experience.length - 1; e >= 0; e--) {
    const bullets = doc.experience[e]?.bullets ?? [];
    if (bullets.length <= (e === 0 ? 2 : 1)) continue;
    let worst = bullets.length - 1;
    bullets.forEach((text, i) => {
      if (relevance(text) <= relevance(bullets[worst] ?? "")) worst = i;
    });
    return { experienceIndex: e, bulletIndex: worst };
  }
  return undefined;
}

export async function fitResume(
  original: ResumeDocument,
  options: {
    template: ResumeTemplate;
    pageSize: PageSize;
    totalYears: number;
    relevance: (text: string) => number;
    render?: Renderer;
  },
): Promise<FitResult> {
  const render = options.render ?? renderResumePdf;
  const steps = FONT_STEPS[options.template];
  const base = { template: options.template, pageSize: options.pageSize };
  let step = 0;
  let fontSize = steps[0] ?? MIN_FONT_SIZE;
  let doc: ResumeDocument = structuredClone(original);
  const dropped: FitResult["dropped"] = [];
  let bytes = await render(doc, { ...base, fontSize });
  let pages = countPdfPages(bytes);

  for (let renders = 1; pages > 1 && renders < MAX_RENDERS; renders++) {
    const drop = bulletToDrop(doc, options.relevance);
    if (drop) {
      const exp = doc.experience[drop.experienceIndex];
      if (!exp) break;
      dropped.push({ experienceId: exp.experienceId, text: exp.bullets[drop.bulletIndex] ?? "" });
      doc = {
        ...doc,
        experience: doc.experience.map((e, i) =>
          i === drop.experienceIndex
            ? { ...e, bullets: e.bullets.filter((_, b) => b !== drop.bulletIndex) }
            : e,
        ),
      };
    } else if (step < steps.length - 1) {
      step++;
      fontSize = steps[step] ?? MIN_FONT_SIZE;
    } else {
      break;
    }
    bytes = await render(doc, { ...base, fontSize });
    pages = countPdfPages(bytes);
  }

  const allowedPages = options.totalYears > 5 ? 2 : 1;
  if (pages > 1 && allowedPages === 2) {
    // Two pages are allowed: keep every bullet when the full resume fits on two.
    const fullFont = steps[0] ?? MIN_FONT_SIZE;
    const full = await render(original, { ...base, fontSize: fullFont });
    const fullPages = countPdfPages(full);
    if (fullPages <= 2) {
      return {
        bytes: full,
        pages: fullPages,
        fontSize: fullFont,
        document: original,
        dropped: [],
        fits: true,
      };
    }
  }
  return { bytes, pages, fontSize, document: doc, dropped, fits: pages <= allowedPages };
}

export async function renderCoverLetterPdf(props: CoverLetterPdfProps): Promise<Uint8Array> {
  const blob = await pdf(<CoverLetterPdf {...props} />).toBlob();
  return new Uint8Array(await blob.arrayBuffer());
}
