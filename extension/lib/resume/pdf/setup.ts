/** Resume PDF templates, page sizes and the bundled font (Lato, SIL Open Font License). */
import { Font } from "@react-pdf/renderer";

export type ResumeTemplate = "classic" | "compact";
export const RESUME_TEMPLATES: { id: ResumeTemplate; label: string }[] = [
  { id: "classic", label: "Classic" },
  { id: "compact", label: "Compact" },
];
export type PageSize = "A4" | "LETTER";

export const FONT_FAMILY = "Lato";
let fontsRegistered = false;

/** Registers the bundled fonts once. `resolve` turns a file name into a URL or path. */
export function registerResumeFonts(resolve: (file: string) => string): void {
  if (fontsRegistered) return;
  fontsRegistered = true;
  Font.register({
    family: FONT_FAMILY,
    fonts: [
      { src: resolve("Lato-Regular.ttf") },
      { src: resolve("Lato-Bold.ttf"), fontWeight: 700 },
      { src: resolve("Lato-Italic.ttf"), fontStyle: "italic" },
    ],
  });
  // No hyphenation: ATS parsers read whole words.
  Font.registerHyphenationCallback((word) => [word]);
}
