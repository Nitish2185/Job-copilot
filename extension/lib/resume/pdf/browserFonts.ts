/** Registers the fonts bundled in the extension (public/fonts) for PDFs made in extension pages. */
import { browser } from "wxt/browser";
import { registerResumeFonts } from "./setup";

const FONT_URLS: Record<string, string> = {
  "Lato-Regular.ttf": browser.runtime.getURL("/fonts/Lato-Regular.ttf"),
  "Lato-Bold.ttf": browser.runtime.getURL("/fonts/Lato-Bold.ttf"),
  "Lato-Italic.ttf": browser.runtime.getURL("/fonts/Lato-Italic.ttf"),
};

export function registerBundledFonts(): void {
  registerResumeFonts((file) => FONT_URLS[file] ?? file);
}
